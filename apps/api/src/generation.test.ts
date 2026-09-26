import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import {
  type ChatMessageDto,
  CreateChatResponseSchema,
  GetChatSessionResponseSchema,
} from '@immersion/contracts/chats';
import {
  ChatReplyGenerationErrorResponseSchema,
  ChatReplyGenerationResponseSchema,
  ChatReplyPromptPreviewResponseSchema,
  GenerationJobResponseSchema,
  GenerationReadinessResponseSchema,
  ListGenerationJobsResponseSchema,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from './app.js';
import { appendChatMessages } from './modules/chats/application/append-chat-messages.js';

const fixtureDataRoot = fileURLToPath(new URL('../testdata/smoke-data', import.meta.url));

interface ProviderRequestRecord {
  authorization: string | null;
  body: unknown;
  url: string;
}

interface ProviderRequestMessageRecord {
  content?: string;
  role?: string;
}

interface ProviderRequestBodyRecord {
  max_tokens?: number;
  messages?: ProviderRequestMessageRecord[];
  min_p?: number;
  presence_penalty?: number;
  rep_pen?: number;
  rep_pen_range?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
}

const ACTIVE_SMOKE_SAMPLING = {
  max_tokens: 640,
  min_p: 0.03,
  presence_penalty: 0.15,
  rep_pen: 1.08,
  rep_pen_range: 1024,
  temperature: 0.72,
  top_k: 42,
  top_p: 0.91,
};

const MODEL_BOUND_SMOKE_SAMPLING = {
  max_tokens: 777,
  min_p: 0.04,
  presence_penalty: 0.2,
  rep_pen: 1.11,
  rep_pen_range: 512,
  temperature: 0.44,
  top_k: 7,
  top_p: 0.82,
};

const EMPTY_CHAT_SAMPLING_OVERRIDES = {
  contextTrimStrategy: null,
  maxContextLength: null,
  maxTokens: null,
  minP: null,
  presencePenalty: null,
  repeatPenalty: null,
  repeatPenaltyRange: null,
  temperature: null,
  topK: null,
  topP: null,
};

interface SmokeUserSettingsFixture {
  activeProvider?: string;
  backendMode?: string;
  activePresetId?: string;
  modelPresetMap?: Record<string, string>;
  responseLanguage?: string;
  streamingEnabled?: boolean;
  systemPromptTemplate?: string;
  userName?: string;
  userPersona?: string;
  providerConfigs?: {
    custom?: {
      apiKey?: string;
      model?: string;
      url?: string;
    };
    koboldcpp?: {
      model?: string;
      url?: string;
    };
    openai?: {
      apiKey?: string;
      model?: string;
      url?: string;
    };
  };
  samplerPresets?: Array<Record<string, unknown>>;
}

describe('generation routes', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-generation-'));
    await fs.cp(fixtureDataRoot, temporaryDataRoot, { recursive: true });
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
    await writeExternalProviderSettings('http://127.0.0.1:6006');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();

    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }

    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  function mockProviderSuccess(content: string) {
    const requests: ProviderRequestRecord[] = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      requests.push({
        authorization: headers.get('authorization'),
        body,
        url: input instanceof Request ? input.url : input.toString(),
      });

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content,
              },
            },
          ],
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    }) as typeof fetch;

    return requests;
  }

  function mockProviderDelayedSuccess(content: string) {
    const requests: ProviderRequestRecord[] = [];
    let releaseProvider: () => void = () => undefined;
    let resolveProviderStarted: () => void = () => undefined;
    const providerStarted = new Promise<void>((resolve) => {
      resolveProviderStarted = resolve;
    });

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      const signal = init?.signal;
      requests.push({
        authorization: headers.get('authorization'),
        body,
        url: input instanceof Request ? input.url : input.toString(),
      });
      resolveProviderStarted();

      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Provider request was aborted.', 'AbortError'));
          return;
        }

        const abort = () => reject(new DOMException('Provider request was aborted.', 'AbortError'));
        signal?.addEventListener('abort', abort, {
          once: true,
        });
        releaseProvider = () => {
          signal?.removeEventListener('abort', abort);
          resolve();
        };
      });

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content,
              },
            },
          ],
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    }) as typeof fetch;

    return {
      providerStarted,
      releaseProvider: () => releaseProvider(),
      requests,
    };
  }

  function mockProviderFailure() {
    const requests: ProviderRequestRecord[] = [];

    globalThis.fetch = vi.fn(async () => {
      requests.push({
        authorization: null,
        body: null,
        url: 'mock-provider-failure',
      });

      return new Response(JSON.stringify({ error: 'provider failed' }), {
        headers: {
          'Content-Type': 'application/json',
        },
        status: 500,
      });
    }) as typeof fetch;

    return requests;
  }

  async function createChat(app: ReturnType<typeof buildApiApp>) {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: {
        title: 'Generation MVP',
      },
    });

    return CreateChatResponseSchema.parse(createResponse.json()).chat;
  }

  function getMessagesByRole(messages: ChatMessageDto[]) {
    return messages.map((message) => ({
      content: message.content,
      role: message.role,
    }));
  }

  function getProviderRequestBody(request: ProviderRequestRecord | undefined): ProviderRequestBodyRecord {
    if (!request?.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      throw new Error('Provider request body was not recorded.');
    }

    return request.body as ProviderRequestBodyRecord;
  }

  async function writeExternalProviderSettings(url: string, model = 'smoke-model') {
    const settingsPath = path.join(temporaryDataRoot, 'user-settings.json');
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as SmokeUserSettingsFixture;
    const providerConfigs = settings.providerConfigs ?? {};

    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          ...settings,
          activeProvider: 'custom',
          backendMode: 'external',
          providerConfigs: {
            ...providerConfigs,
            custom: {
              ...providerConfigs.custom,
              apiKey: 'secret-token',
              model,
              url,
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  async function writeProviderSettings(patch: SmokeUserSettingsFixture) {
    const settingsPath = path.join(temporaryDataRoot, 'user-settings.json');
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as SmokeUserSettingsFixture;

    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          ...settings,
          ...patch,
          providerConfigs: {
            ...settings.providerConfigs,
            ...patch.providerConfigs,
          },
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  async function writeDetachedRuntimeState(modelPath: string, port = 6006) {
    await fs.writeFile(
      path.join(temporaryDataRoot, '.llm-server.json'),
      JSON.stringify(
        {
          model: path.basename(modelPath),
          modelPath,
          pid: process.pid,
          port,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  async function updateChatGenerationSettings(app: ReturnType<typeof buildApiApp>, chatId: string, payload: object) {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload,
    });

    expect(response.statusCode).toBe(200);
  }

  async function waitForGenerationJobStatus(
    app: ReturnType<typeof buildApiApp>,
    jobId: string,
    expectedStatus: string,
  ) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/generation/jobs/${jobId}`,
      });
      const payload = GenerationJobResponseSchema.parse(response.json());

      if (payload.job.status === expectedStatus) {
        return payload.job;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error(`Generation job ${jobId} did not reach status ${expectedStatus}.`);
  }

  it('reports generation readiness for a configured external provider', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/generation/readiness',
    });
    const payload = GenerationReadinessResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      activeProvider: 'custom',
      issue: null,
      mode: 'external',
      runtime: null,
      status: 'ready',
    });

    await app.close();
  });

  it('blocks generation readiness when the external provider URL is missing', async () => {
    await writeProviderSettings({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: {
        custom: {
          url: '   ',
        },
      },
    });
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/generation/readiness',
    });
    const payload = GenerationReadinessResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      issue: {
        code: 'external_provider_url_missing',
      },
      mode: 'external',
      status: 'blocked',
    });

    await app.close();
  });

  it('blocks generation readiness when the external provider URL is invalid', async () => {
    await writeProviderSettings({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: {
        custom: {
          url: 'not-a-url',
        },
      },
    });
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/generation/readiness',
    });
    const payload = GenerationReadinessResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      issue: {
        code: 'external_provider_url_invalid',
      },
      mode: 'external',
      status: 'blocked',
    });

    await app.close();
  });

  it('blocks generation readiness when a cloud provider has no API key', async () => {
    await writeProviderSettings({
      activeProvider: 'openai',
      backendMode: 'external',
      providerConfigs: {
        openai: {
          model: 'gpt-4o',
          url: 'https://api.openai.com/v1',
        },
      },
    });
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/generation/readiness',
    });
    const payload = GenerationReadinessResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      issue: {
        code: 'external_provider_api_key_missing',
        message: 'API-ключ провайдера не задан. Укажите его на странице API.',
      },
      mode: 'external',
      status: 'blocked',
    });

    await app.close();
  });

  it('blocks generation readiness when builtin runtime is not running', async () => {
    await writeProviderSettings({
      backendMode: 'builtin',
    });
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/generation/readiness',
    });
    const payload = GenerationReadinessResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.mode).toBe('builtin');
    expect(payload.status).toBe('blocked');
    expect(payload.issue?.code).toMatch(/^builtin_/u);
    expect(payload.runtime).not.toBeNull();

    await app.close();
  });

  it('leaves vision unknown while the built-in runtime is stopped, since there is nothing to ask', async () => {
    await writeProviderSettings({
      backendMode: 'builtin',
    });
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/generation/readiness',
    });
    const payload = GenerationReadinessResponseSchema.parse(response.json());

    expect(payload.status).toBe('blocked');
    expect(payload.visionSupport).toBe('unknown');

    await app.close();
  });

  it('reports built-in vision by the --mmproj launch recorded for the running server, not by the model file', async () => {
    await writeProviderSettings({ backendMode: 'builtin' });
    const modelPath = path.join(temporaryDataRoot, 'qwen-vl.gguf');
    await fs.writeFile(modelPath, 'gguf', 'utf8');
    const fetchSpy = vi.fn<typeof fetch>();
    globalThis.fetch = fetchSpy;

    async function leaveServerRunningFromPreviousApiProcess(mmprojPath: string | null) {
      await fs.writeFile(
        path.join(temporaryDataRoot, '.llm-server.json'),
        JSON.stringify({ mmprojPath, model: 'qwen-vl.gguf', modelPath, pid: process.pid, port: 5001 }),
        'utf8',
      );
    }

    async function readVisionSupport() {
      const app = buildApiApp();
      const response = await app.inject({ method: 'GET', url: '/api/generation/readiness' });
      const payload = GenerationReadinessResponseSchema.parse(response.json());
      await app.close();

      return payload;
    }

    await leaveServerRunningFromPreviousApiProcess(null);
    const withoutProjector = await readVisionSupport();

    expect(withoutProjector.status).toBe('ready');
    expect(withoutProjector.visionSupport).toBe('unsupported');

    await leaveServerRunningFromPreviousApiProcess(path.join(temporaryDataRoot, 'mmproj-qwen-vl.gguf'));
    const withProjector = await readVisionSupport();

    expect(withProjector.visionSupport).toBe('supported');
    expect(fetchSpy).not.toHaveBeenCalled();

    await fs.rm(path.join(temporaryDataRoot, '.llm-server.json'), { force: true });
  });

  it('keeps prompt preview available when builtin generation is blocked', async () => {
    await writeProviderSettings({
      backendMode: 'builtin',
      responseLanguage: 'ru',
      systemPromptTemplate: 'Blocked runtime global prompt that must not leak.',
    });
    const providerRequests = mockProviderSuccess('Blocked preview must not call provider.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        draftUserMessage: 'Preview while runtime is blocked.',
      },
    });
    const payload = ChatReplyPromptPreviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.provider).toMatchObject({
      model: null,
      readiness: {
        mode: 'builtin',
        status: 'blocked',
      },
    });
    expect(payload.request.messages).toEqual([
      {
        role: 'user',
        content: 'Preview while runtime is blocked.',
      },
    ]);
    expect(providerRequests).toHaveLength(0);

    await app.close();
  });

  it('reports approximate token counting in preview when no tokenize-capable provider is available', async () => {
    const providerRequests = mockProviderSuccess('Preview must not call provider.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        draftUserMessage: 'Считай токены эвристикой.',
      },
    });
    const payload = ChatReplyPromptPreviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.diagnostics.tokenCountMethod).toBe('approximate');
    // External providers are never tokenized: no provider traffic at all.
    expect(providerRequests).toHaveLength(0);

    await app.close();
  });

  it('reports exact token counting in preview via the llama-server tokenize endpoint', async () => {
    await writeProviderSettings({
      backendMode: 'builtin',
    });
    await writeDetachedRuntimeState(path.join(temporaryDataRoot, 'models', 'sandbox.gguf'), 6011);
    const tokenizeRequests: string[] = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      tokenizeRequests.push(url);

      if (url === 'http://127.0.0.1:6011/tokenize') {
        const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { content?: string }) : {};
        const tokenCount = Math.ceil((body.content ?? '').length / 3);

        return new Response(JSON.stringify({ tokens: Array.from({ length: tokenCount }, (_, index) => index) }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        draftUserMessage: 'Считай токены точно через llama-server.',
      },
    });
    const payload = ChatReplyPromptPreviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.diagnostics.tokenCountMethod).toBe('exact');
    expect(tokenizeRequests.every((url) => url.startsWith('http://127.0.0.1:6011/'))).toBe(true);
    expect(tokenizeRequests.some((url) => url.endsWith('/tokenize'))).toBe(true);
    expect(tokenizeRequests.some((url) => url.includes('/chat/completions'))).toBe(false);

    await app.close();
  });

  it('reports exact token counting in preview via the KoboldCpp tokencount endpoint', async () => {
    await writeProviderSettings({
      backendMode: 'builtin',
    });
    await writeDetachedRuntimeState(path.join(temporaryDataRoot, 'models', 'sandbox.gguf'), 6012);
    const tokenizeRequests: string[] = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      tokenizeRequests.push(url);

      if (url === 'http://127.0.0.1:6012/api/extra/tokencount') {
        const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { prompt?: string }) : {};

        return new Response(JSON.stringify({ value: Math.ceil((body.prompt ?? '').length / 3) }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        draftUserMessage: 'Считай токены точно через KoboldCpp.',
      },
    });
    const payload = ChatReplyPromptPreviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.diagnostics.tokenCountMethod).toBe('exact');
    expect(tokenizeRequests.some((url) => url.endsWith('/api/extra/tokencount'))).toBe(true);
    expect(tokenizeRequests.some((url) => url.includes('/chat/completions'))).toBe(false);

    await app.close();
  });

  it('streams a job reply when streaming is enabled and stores the joined text', async () => {
    const chunks = ['Пер', 'вый ', 'кусок.'];
    const requests: ProviderRequestRecord[] = [];

    globalThis.fetch = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({
        authorization: new Headers(init?.headers).get('authorization'),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        url: input instanceof Request ? input.url : input.toString(),
      });

      const body = [
        ...chunks.map((delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`),
        'data: [DONE]\n\n',
      ].join('');

      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' }, status: 200 });
    });

    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId: chat.id, message: 'Расскажи что-нибудь.', mode: 'reply' },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(202);

    await waitForGenerationJobStatus(app, payload.job.id, 'completed');

    expect(requests[0]?.body).toMatchObject({ stream: true });

    const sessionResponse = await app.inject({ method: 'GET', url: `/api/chats/${chat.id}` });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual([
      { role: 'user', content: 'Расскажи что-нибудь.' },
      { role: 'assistant', content: 'Первый кусок.' },
    ]);

    await app.close();
  });

  it('asks the provider for a whole reply when the profile turns streaming off', async () => {
    await writeProviderSettings({ streamingEnabled: false });
    const providerRequests = mockProviderSuccess('Целый ответ.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId: chat.id, message: 'Расскажи что-нибудь.', mode: 'reply' },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());

    await waitForGenerationJobStatus(app, payload.job.id, 'completed');

    expect(getProviderRequestBody(providerRequests[0])).toMatchObject({ stream: false });

    await app.close();
  });

  it('keeps the model reasoning out of the reply and stores it beside the message', async () => {
    mockProviderSuccess('<think>Сначала прикину тон.</think>Привет! Чем помочь?');
    const app = buildApiApp();
    const chat = await createChat(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { chatId: chat.id, message: 'Привет.' },
    });
    const payload = ChatReplyGenerationResponseSchema.parse(response.json());
    const assistantMessage = payload.session.messages.at(-1);

    expect(response.statusCode).toBe(200);
    expect(assistantMessage?.content).toBe('Привет! Чем помочь?');
    expect(assistantMessage?.reasoning).toBe('Сначала прикину тон.');

    const sessionResponse = await app.inject({ method: 'GET', url: `/api/chats/${chat.id}` });
    const stored = GetChatSessionResponseSchema.parse(sessionResponse.json()).messages.at(-1);

    expect(stored?.content).toBe('Привет! Чем помочь?');
    expect(stored?.reasoning).toBe('Сначала прикину тон.');

    await app.close();
  });

  it('sends an attached image to the provider as an OpenAI image part', async () => {
    const providerRequests = mockProviderSuccess('Вижу градиент.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex',
    );
    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/attachments`,
      payload: { contentBase64: png.toString('base64'), mimeType: 'image/png' },
    });
    const attachmentId = (uploadResponse.json() as { attachment: { id: string } }).attachment.id;

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { attachmentIds: [attachmentId], chatId: chat.id, message: 'Что на картинке?' },
    });

    expect(response.statusCode).toBe(200);
    expect(providerRequests).toHaveLength(1);

    const messages = (providerRequests[0]?.body as { messages: unknown[] }).messages;
    const userMessage = messages.find(
      (message): message is { content: unknown[]; role: string } =>
        typeof message === 'object' && message !== null && (message as { role?: string }).role === 'user',
    );

    // Текст и картинка уходят частями одного сообщения: так их принимает
    // OpenAI-совместимый API, включая llama.cpp и LM Studio.
    expect(userMessage?.content).toEqual([
      { text: 'Что на картинке?', type: 'text' },
      { image_url: { url: `data:image/png;base64,${png.toString('base64')}` }, type: 'image_url' },
    ]);

    await app.close();
  });

  it('calls the active provider without streaming and persists the user message with the assistant reply', async () => {
    const providerRequests = mockProviderSuccess('Assistant reply from provider.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Hello model.',
      },
    });
    const payload = ChatReplyGenerationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(getMessagesByRole(payload.session.messages)).toEqual([
      {
        role: 'user',
        content: 'Hello model.',
      },
      {
        role: 'assistant',
        content: 'Assistant reply from provider.',
      },
    ]);
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]).toMatchObject({
      authorization: 'Bearer secret-token',
      url: 'http://127.0.0.1:6006/v1/chat/completions',
    });
    expect(providerRequests[0]?.body).toMatchObject({
      ...MODEL_BOUND_SMOKE_SAMPLING,
      messages: expect.arrayContaining([
        {
          role: 'user',
          content: 'Hello model.',
        },
      ]),
      model: 'smoke-model',
      stream: false,
    });
    const requestBody = getProviderRequestBody(providerRequests[0]);
    const submittedMessages =
      requestBody.messages?.filter((message) => message.role === 'user' && message.content === 'Hello model.') ?? [];

    expect(submittedMessages).toHaveLength(1);

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual(getMessagesByRole(payload.session.messages));

    await app.close();
  });

  it('previews a generic chat reply without leaking global RP prompt context or persisting the draft', async () => {
    await writeProviderSettings({
      responseLanguage: 'ru',
      systemPromptTemplate: 'Roleplay prompt for {{user}}. {{#if userPersona}}Persona: {{userPersona}}{{/if}}',
      userName: 'Alex',
      userPersona: 'Careful tester.',
    });
    const providerRequests = mockProviderSuccess('Preview must not call provider.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        draftUserMessage: 'Plain preview message.',
      },
    });
    const payload = ChatReplyPromptPreviewResponseSchema.parse(response.json());
    const previewContent = payload.request.messages.map((message) => message.content).join('\n');

    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      chatId: chat.id,
      diagnostics: {
        systemPromptIncluded: false,
        systemMessageCount: 0,
        transcriptMessageCount: 1,
      },
      provider: {
        model: 'smoke-model',
      },
    });
    expect(payload.request.messages).toEqual([
      {
        role: 'user',
        content: 'Plain preview message.',
      },
    ]);
    expect(previewContent).not.toContain('Roleplay prompt');
    expect(previewContent).not.toContain('Careful tester.');
    expect(previewContent).not.toContain('Answer in Russian');
    expect(JSON.stringify(payload)).not.toContain('secret-token');
    expect(JSON.stringify(payload)).not.toContain('http://127.0.0.1:6006');
    expect(providerRequests).toHaveLength(0);

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(sessionPayload.messages).toEqual([]);

    await app.close();
  });

  it('previews the prompt with character description, personality and per-card scenario for a character chat', async () => {
    const charactersDir = path.join(temporaryDataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.writeFile(
      path.join(charactersDir, 'Aria.json'),
      JSON.stringify({
        name: 'Ария',
        description: 'Молодая скульпторша из Петербурга.',
        personality: 'Тихая, но острая на язык.',
        scenario: 'В мастерской вечером, в стенах пахнет глиной.',
        first_message: 'Привет, ты впервые в студии?',
      }),
      'utf8',
    );

    const app = buildApiApp();
    const createChatResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { characterId: 'Aria.json' },
    });
    const createdChat = CreateChatResponseSchema.parse(createChatResponse.json()).chat;

    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: { chatId: createdChat.id, draftUserMessage: 'Расскажи о себе.' },
    });
    const preview = ChatReplyPromptPreviewResponseSchema.parse(previewResponse.json());
    const systemMessage = preview.request.messages.find((message) => message.role === 'system');

    expect(previewResponse.statusCode).toBe(200);
    expect(preview.diagnostics.systemPromptIncluded).toBe(true);
    expect(systemMessage).toBeDefined();
    expect(systemMessage?.content).toContain('Ария');
    expect(systemMessage?.content).toContain('Молодая скульпторша из Петербурга.');
    expect(systemMessage?.content).toContain('Тихая, но острая на язык.');
    expect(systemMessage?.content).toContain('В мастерской вечером, в стенах пахнет глиной.');
    // Seed first_message also lands in the transcript
    expect(
      preview.request.messages.some(
        (m) => m.role === 'assistant' && m.content.includes('Привет, ты впервые в студии?'),
      ),
    ).toBe(true);

    await app.close();
  });

  it('injects scenario content into the prompt for a scenario-bound chat', async () => {
    const scenariosDir = path.join(temporaryDataRoot, 'scenarios');
    await fs.mkdir(scenariosDir, { recursive: true });
    await fs.writeFile(
      path.join(scenariosDir, 'Ice training.json'),
      JSON.stringify({
        name: 'Ice training',
        content: 'A figure skater practises quads under the watchful coach Daniil Markovich.',
        concept: 'Pressure on the rink.',
      }),
      'utf8',
    );

    const app = buildApiApp();
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { scenarioId: 'Ice training.json' },
    });
    const chatPayload = CreateChatResponseSchema.parse(createResponse.json());
    expect(createResponse.statusCode).toBe(201);
    expect(chatPayload.chat.scenarioId).toBe('Ice training.json');
    expect(chatPayload.chat.scenarioName).toBe('Ice training');
    expect(chatPayload.chat.title).toBe('Ice training');

    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: { chatId: chatPayload.chat.id, draftUserMessage: 'Start.' },
    });
    const preview = ChatReplyPromptPreviewResponseSchema.parse(previewResponse.json());
    const systemMessage = preview.request.messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('figure skater practises quads');

    await app.close();
  });

  it('injects matching lorebook entries into the prompt when keys are mentioned', async () => {
    const worldsDir = path.join(temporaryDataRoot, 'worlds');
    await fs.mkdir(worldsDir, { recursive: true });
    await fs.writeFile(
      path.join(worldsDir, 'Studio.json'),
      JSON.stringify({
        name: 'Студия «Меандр»',
        entries: [
          { keys: ['Меандр'], content: 'Студия керамики в Петербурге.', enabled: true, priority: 5 },
          { keys: ['обжиг'], content: 'Процесс обжига занимает 12 часов.', enabled: true, priority: 1 },
          { keys: ['неупомянуто'], content: 'Не должно сработать.', enabled: true, priority: 0 },
        ],
      }),
      'utf8',
    );

    const app = buildApiApp();
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { lorebookIds: ['Studio.json'], title: 'lorebook chat' },
    });
    const chatPayload = CreateChatResponseSchema.parse(createResponse.json());
    expect(createResponse.statusCode).toBe(201);

    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chatPayload.chat.id,
        draftUserMessage: 'Расскажи про Меандр.',
      },
    });
    const preview = ChatReplyPromptPreviewResponseSchema.parse(previewResponse.json());
    const systemMessage = preview.request.messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('World context');
    expect(systemMessage?.content).toContain('Студия керамики в Петербурге.');
    expect(systemMessage?.content).not.toContain('Процесс обжига занимает 12 часов.');
    expect(systemMessage?.content).not.toContain('Не должно сработать.');

    await app.close();
  });

  it('keeps the generic helper prompt for chats without a character', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);

    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: { chatId: chat.id, draftUserMessage: 'Plain question.' },
    });
    const preview = ChatReplyPromptPreviewResponseSchema.parse(previewResponse.json());

    expect(previewResponse.statusCode).toBe(200);
    expect(preview.diagnostics.systemPromptIncluded).toBe(false);
    expect(preview.diagnostics.systemMessageCount).toBe(0);

    await app.close();
  });

  it('previews the prompt with an edited transcript message via messageOverrides', async () => {
    mockProviderSuccess('Setup reply.');
    const app = buildApiApp();
    const chat = await createChat(app);

    const firstReplyResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Original prompt.',
      },
    });
    expect(firstReplyResponse.statusCode).toBe(200);

    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        messageOverrides: [{ messageIndex: 1, content: 'Edited prompt with extra context.' }],
      },
    });
    const preview = ChatReplyPromptPreviewResponseSchema.parse(previewResponse.json());
    const userTurnContents = preview.request.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content);

    expect(previewResponse.statusCode).toBe(200);
    expect(userTurnContents).toContain('Edited prompt with extra context.');
    expect(userTurnContents).not.toContain('Original prompt.');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());
    expect(sessionPayload.messages[0]?.content).toBe('Original prompt.');

    await app.close();
  });

  it('returns 404 when previewing with an out-of-range messageOverride index', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);

    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        messageOverrides: [{ messageIndex: 9, content: 'no such message' }],
      },
    });

    expect(previewResponse.statusCode).toBe(404);
    expect(previewResponse.json()).toMatchObject({ code: 'chat_message_not_found' });

    await app.close();
  });

  it('matches previewed provider payload to the real generation payload for the same draft', async () => {
    const providerRequests = mockProviderSuccess('Assistant reply after preview.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const previewResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        draftUserMessage: 'Compare preview to generation.',
      },
    });
    const preview = ChatReplyPromptPreviewResponseSchema.parse(previewResponse.json());
    const generationResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Compare preview to generation.',
      },
    });
    const generationRequest = getProviderRequestBody(providerRequests[0]);

    expect(previewResponse.statusCode).toBe(200);
    expect(generationResponse.statusCode).toBe(200);
    expect(generationRequest.messages).toEqual(preview.request.messages);
    expect(generationRequest.max_tokens).toBe(preview.request.maxTokens);
    expect(generationRequest).toMatchObject({
      min_p: preview.request.sampling.minP,
      presence_penalty: preview.request.sampling.presencePenalty,
      rep_pen: preview.request.sampling.repeatPenalty,
      rep_pen_range: preview.request.sampling.repeatPenaltyRange,
      temperature: preview.request.sampling.temperature,
      top_k: preview.request.sampling.topK,
      top_p: preview.request.sampling.topP,
    });

    await app.close();
  });

  it('does not render the global settings prompt template for generic chat replies', async () => {
    await writeProviderSettings({
      responseLanguage: 'ru',
      systemPromptTemplate: 'Roleplay prompt for {{user}}. {{#if userPersona}}Persona: {{userPersona}}{{/if}}',
      userName: 'Alex',
      userPersona: 'Careful tester.',
    });
    const providerRequests = mockProviderSuccess('Assistant reply without global prompt.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Plain chat message.',
      },
    });

    expect(response.statusCode).toBe(200);
    const requestBody = getProviderRequestBody(providerRequests[0]);
    const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';

    expect(requestBody.messages?.filter((message) => message.role === 'system')).toEqual([]);
    expect(submittedContent).toContain('Plain chat message.');
    expect(submittedContent).not.toContain('Roleplay prompt');
    expect(submittedContent).not.toContain('Careful tester.');
    expect(submittedContent).not.toContain('Answer in Russian');

    await app.close();
  });

  it('starts a chat reply job without blocking provider completion', async () => {
    const provider = mockProviderDelayedSuccess('Async assistant reply.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        message: 'Start async reply.',
      },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(202);
    expect(payload.job).toMatchObject({
      chatId: chat.id,
      kind: 'chat_reply',
      status: 'queued',
    });
    expect(getMessagesByRole(payload.session.messages)).toEqual([
      {
        role: 'user',
        content: 'Start async reply.',
      },
    ]);

    await provider.providerStarted;

    const jobsResponse = await app.inject({
      method: 'GET',
      url: `/api/generation/jobs?chatId=${chat.id}`,
    });
    const jobsPayload = ListGenerationJobsResponseSchema.parse(jobsResponse.json());

    expect(jobsPayload.items[0]).toMatchObject({
      id: payload.job.id,
      status: 'running',
    });

    provider.releaseProvider();

    await waitForGenerationJobStatus(app, payload.job.id, 'completed');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual([
      {
        role: 'user',
        content: 'Start async reply.',
      },
      {
        role: 'assistant',
        content: 'Async assistant reply.',
      },
    ]);

    await app.close();
  });

  it('cancels a chat reply job without appending an assistant reply', async () => {
    const provider = mockProviderDelayedSuccess('Canceled assistant reply.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const startResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        message: 'Cancel async reply.',
      },
    });
    const startPayload = StartChatReplyGenerationJobResponseSchema.parse(startResponse.json());

    await provider.providerStarted;

    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/api/generation/jobs/${startPayload.job.id}/cancel`,
    });
    const cancelPayload = GenerationJobResponseSchema.parse(cancelResponse.json());

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelPayload.job.status).toBe('canceled');

    await waitForGenerationJobStatus(app, startPayload.job.id, 'canceled');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual([
      {
        role: 'user',
        content: 'Cancel async reply.',
      },
    ]);

    await app.close();
  });

  it('rejects a second active chat reply job without duplicating user messages', async () => {
    const provider = mockProviderDelayedSuccess('First async assistant reply.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        message: 'First active job.',
      },
    });
    const firstPayload = StartChatReplyGenerationJobResponseSchema.parse(firstResponse.json());

    await provider.providerStarted;

    const secondResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        message: 'Second active job.',
      },
    });

    expect(secondResponse.statusCode).toBe(409);
    expect(secondResponse.json()).toMatchObject({
      code: 'active_generation_job_exists',
      job: {
        id: firstPayload.job.id,
      },
    });

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual([
      {
        role: 'user',
        content: 'First active job.',
      },
    ]);

    await app.inject({
      method: 'POST',
      url: `/api/generation/jobs/${firstPayload.job.id}/cancel`,
    });
    await app.close();
  });

  it('regenerates the last assistant reply by dropping it and producing a new one from the same user turn', async () => {
    const firstProvider = mockProviderSuccess('First reply.');
    const app = buildApiApp();
    const chat = await createChat(app);

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Tell me a joke.',
      },
    });
    expect(firstResponse.statusCode).toBe(200);
    expect(firstProvider).toHaveLength(1);

    const secondProvider = mockProviderSuccess('Regenerated reply.');
    const regenerateResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs/regenerate',
      payload: {
        chatId: chat.id,
      },
    });
    const regeneratePayload = StartChatReplyGenerationJobResponseSchema.parse(regenerateResponse.json());

    expect(regenerateResponse.statusCode).toBe(202);
    expect(regeneratePayload.job).toMatchObject({
      chatId: chat.id,
      kind: 'chat_reply',
    });
    expect(getMessagesByRole(regeneratePayload.session.messages)).toEqual([
      { role: 'user', content: 'Tell me a joke.' },
    ]);

    await waitForGenerationJobStatus(app, regeneratePayload.job.id, 'completed');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual([
      { role: 'user', content: 'Tell me a joke.' },
      { role: 'assistant', content: 'Regenerated reply.' },
    ]);
    expect(secondProvider).toHaveLength(1);
    const regenRequestBody = getProviderRequestBody(secondProvider[0]);
    const userTurns =
      regenRequestBody.messages?.filter(
        (message) => message.role === 'user' && message.content === 'Tell me a joke.',
      ) ?? [];
    expect(userTurns).toHaveLength(1);

    await app.close();
  });

  it('refuses to regenerate when the last message is not an assistant reply', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs/regenerate',
      payload: {
        chatId: chat.id,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'no_assistant_message_to_regenerate',
    });

    await app.close();
  });

  it('continues the last assistant reply by appending to the same message', async () => {
    const provider = mockProviderSuccess('Это и делает её прочной.');
    const app = buildApiApp();
    const chat = await createChat(app);
    await appendChatMessages(chat.id, [
      {
        role: 'user',
        content: 'Расскажи про обжиг керамики.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        role: 'assistant',
        content: 'Обжиг превращает глину в керамику при высокой температуре, и',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        mode: 'continue',
      },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(202);
    expect(payload.job).toMatchObject({
      chatId: chat.id,
      kind: 'chat_reply',
    });
    // Старт continue-job не добавляет новых сообщений.
    expect(payload.session.messages).toHaveLength(2);

    await waitForGenerationJobStatus(app, payload.job.id, 'completed');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual([
      { role: 'user', content: 'Расскажи про обжиг керамики.' },
      {
        role: 'assistant',
        content: 'Обжиг превращает глину в керамику при высокой температуре, и Это и делает её прочной.',
      },
    ]);

    expect(provider).toHaveLength(1);
    const requestBody = getProviderRequestBody(provider[0]);
    const promptMessages = requestBody.messages ?? [];
    // Транскрипт уходит в промпт как есть, включая продолжаемый ответ.
    expect(
      promptMessages.some(
        (message) =>
          message.role === 'assistant' &&
          message.content === 'Обжиг превращает глину в керамику при высокой температуре, и',
      ),
    ).toBe(true);
    const trailingInstruction = promptMessages.at(-1);
    expect(trailingInstruction?.role).toBe('user');
    expect(trailingInstruction?.content).toContain('Continue your previous reply');
    expect(trailingInstruction?.content).toContain('Do not repeat');
    // Fixture profile responseLanguage is 'ru'.
    expect(trailingInstruction?.content).toContain('Write the continuation in Russian.');

    await app.close();
  });

  it('answers the last user message without appending a new one', async () => {
    const provider = mockProviderSuccess('Ответ на уже сохранённое сообщение.');
    const app = buildApiApp();
    const chat = await createChat(app);
    await appendChatMessages(chat.id, [
      {
        role: 'user',
        content: 'Вопрос без ответа.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        mode: 'answer',
      },
    });

    expect(response.statusCode).toBe(202);
    const startPayload = StartChatReplyGenerationJobResponseSchema.parse(response.json());
    await waitForGenerationJobStatus(app, startPayload.job.id, 'completed');

    const sessionPayload = GetChatSessionResponseSchema.parse(
      (await app.inject({ method: 'GET', url: `/api/chats/${chat.id}` })).json(),
    );
    expect(sessionPayload.messages.map((message) => message.content)).toEqual([
      'Вопрос без ответа.',
      'Ответ на уже сохранённое сообщение.',
    ]);
    expect(provider).toHaveLength(1);

    await app.close();
  });

  it('refuses to answer when the last message is not a non-empty user message', async () => {
    const provider = mockProviderSuccess('Should not be called.');
    const app = buildApiApp();

    const emptyChat = await createChat(app);
    const emptyChatResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: emptyChat.id,
        mode: 'answer',
      },
    });

    expect(emptyChatResponse.statusCode).toBe(409);
    expect(emptyChatResponse.json()).toMatchObject({ code: 'nothing_to_answer' });

    const chat = await createChat(app);
    await appendChatMessages(chat.id, [
      {
        role: 'assistant',
        content: 'Последним пишет персонаж.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        mode: 'answer',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'nothing_to_answer' });
    expect(provider).toHaveLength(0);

    await app.close();
  });

  it('refuses to continue when the last message is not a non-empty assistant reply', async () => {
    const provider = mockProviderSuccess('Should not be called.');
    const app = buildApiApp();

    const emptyChat = await createChat(app);
    const emptyChatResponse = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: emptyChat.id,
        mode: 'continue',
      },
    });

    expect(emptyChatResponse.statusCode).toBe(409);
    expect(emptyChatResponse.json()).toMatchObject({ code: 'nothing_to_continue' });

    const chat = await createChat(app);
    await appendChatMessages(chat.id, [
      {
        role: 'user',
        content: 'Последним пишет пользователь.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        mode: 'continue',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'nothing_to_continue' });
    expect(provider).toHaveLength(0);

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());
    expect(sessionPayload.messages).toHaveLength(1);

    await app.close();
  });

  it('fails the continue job without touching the transcript when the chat changes mid-generation', async () => {
    const app = buildApiApp();
    const chat = await createChat(app);
    await appendChatMessages(chat.id, [
      {
        role: 'user',
        content: 'Расскажи про обжиг керамики.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        role: 'assistant',
        content: 'Обжиг превращает глину в керамику при высокой температуре, и',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ]);

    // Пока провайдер отвечает, пользователь успевает дописать своё сообщение.
    globalThis.fetch = vi.fn(async () => {
      await appendChatMessages(chat.id, [
        {
          role: 'user',
          content: 'Я успел написать раньше продолжения.',
          createdAt: '2026-01-01T00:00:02.000Z',
        },
      ]);

      return new Response(JSON.stringify({ choices: [{ message: { content: 'потерянное продолжение.' } }] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }) as typeof fetch;

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        mode: 'continue',
      },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(202);

    const failedJob = await waitForGenerationJobStatus(app, payload.job.id, 'failed');
    expect(failedJob.error).toMatchObject({ code: 'chat_changed_during_generation' });

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual([
      { role: 'user', content: 'Расскажи про обжиг керамики.' },
      { role: 'assistant', content: 'Обжиг превращает глину в керамику при высокой температуре, и' },
      { role: 'user', content: 'Я успел написать раньше продолжения.' },
    ]);

    await app.close();
  });

  it('returns 404 when regenerating a missing chat', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs/regenerate',
      payload: {
        chatId: 'never-existed',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_not_found' });

    await app.close();
  });

  it('falls back to the active sampler preset when the provider model has no binding', async () => {
    await writeExternalProviderSettings('http://127.0.0.1:6006', 'unbound-model');
    const providerRequests = mockProviderSuccess('Assistant reply from unbound provider.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Use active preset.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]?.body).toMatchObject({
      ...ACTIVE_SMOKE_SAMPLING,
      model: 'unbound-model',
      stream: false,
    });

    await app.close();
  });

  it('applies chat-owned generation settings over model-bound sampler presets', async () => {
    await writeProviderSettings({
      responseLanguage: 'none',
      systemPromptTemplate: 'Global template that must not win for {{user}}.',
      userName: 'Prompt Tester',
    });
    const providerRequests = mockProviderSuccess('Assistant reply with chat overrides.');
    const app = buildApiApp();
    const chat = await createChat(app);

    await updateChatGenerationSettings(app, chat.id, {
      additionalInstructions: null,
      samplerPresetId: 'default',
      systemPrompt: 'Custom system prompt for this chat.',
      sampling: {
        ...EMPTY_CHAT_SAMPLING_OVERRIDES,
        maxContextLength: 4096,
        maxTokens: 222,
        temperature: 0.55,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Use chat settings.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]?.body).toMatchObject({
      ...ACTIVE_SMOKE_SAMPLING,
      max_tokens: 222,
      model: 'smoke-model',
      stream: false,
      temperature: 0.55,
    });
    const requestBody = getProviderRequestBody(providerRequests[0]);
    const systemMessages = requestBody.messages?.filter((message) => message.role === 'system') ?? [];

    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0]?.content).toContain('Custom system prompt for this chat.');
    expect(systemMessages[0]?.content).not.toContain('Global template that must not win');

    await app.close();
  });

  it('previews explicit chat system prompts without mixing in the global template', async () => {
    await writeProviderSettings({
      responseLanguage: 'none',
      systemPromptTemplate: 'Global template that must not win for {{user}}.',
      userName: 'Prompt Tester',
    });
    const app = buildApiApp();
    const chat = await createChat(app);

    await updateChatGenerationSettings(app, chat.id, {
      additionalInstructions: null,
      samplerPresetId: null,
      systemPrompt: 'Custom system prompt for {{user}}.',
      sampling: EMPTY_CHAT_SAMPLING_OVERRIDES,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        draftUserMessage: 'Preview with explicit system prompt.',
      },
    });
    const payload = ChatReplyPromptPreviewResponseSchema.parse(response.json());
    const systemMessages = payload.request.messages.filter((message) => message.role === 'system');

    expect(response.statusCode).toBe(200);
    expect(payload.diagnostics).toMatchObject({
      promptSource: {
        kind: 'chat-override',
      },
      systemPromptIncluded: true,
      systemMessageCount: 1,
    });
    expect(systemMessages).toEqual([
      {
        role: 'system',
        content: 'Custom system prompt for Prompt Tester.',
      },
    ]);
    expect(systemMessages[0]?.content).not.toContain('Global template that must not win');

    await app.close();
  });

  it('applies effective generation settings before prompt context budgeting', async () => {
    await writeProviderSettings({
      responseLanguage: 'none',
      systemPromptTemplate: 'Short prompt.',
    });
    const providerRequests = mockProviderSuccess('Assistant reply after prompt budgeting.');
    const app = buildApiApp();
    const chat = await createChat(app);

    await appendChatMessages(chat.id, [
      {
        content: 'OLD_CONTEXT '.repeat(80),
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'user',
      },
      {
        content: 'OLD_ASSISTANT '.repeat(80),
        createdAt: '2026-01-01T00:00:01.000Z',
        role: 'assistant',
      },
    ]);
    await updateChatGenerationSettings(app, chat.id, {
      additionalInstructions: null,
      samplerPresetId: null,
      systemPrompt: null,
      sampling: {
        ...EMPTY_CHAT_SAMPLING_OVERRIDES,
        contextTrimStrategy: 'trim_start',
        maxContextLength: 48,
        maxTokens: 24,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'LATEST_USER_MESSAGE stays.',
      },
    });
    const requestBody = getProviderRequestBody(providerRequests[0]);
    const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';

    expect(response.statusCode).toBe(200);
    expect(submittedContent).not.toContain('OLD_CONTEXT');
    expect(submittedContent).not.toContain('OLD_ASSISTANT');
    expect(submittedContent).toContain('LATEST_USER_MESSAGE stays.');

    await app.close();
  });

  it('ignores stale sampler bindings and uses the active preset', async () => {
    await writeProviderSettings({
      modelPresetMap: {
        'smoke-model': 'missing-preset',
      },
    });
    const providerRequests = mockProviderSuccess('Assistant reply with active preset.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Ignore stale binding.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]?.body).toMatchObject({
      ...ACTIVE_SMOKE_SAMPLING,
      model: 'smoke-model',
      stream: false,
    });

    await app.close();
  });

  it('falls back to the active sampler preset when provider model is blank', async () => {
    await writeExternalProviderSettings('http://127.0.0.1:6006', '   ');
    const providerRequests = mockProviderSuccess('Assistant reply with default transport model.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Use fallback model and active preset.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]?.body).toMatchObject({
      ...ACTIVE_SMOKE_SAMPLING,
      model: 'local-model',
      stream: false,
    });

    await app.close();
  });

  it('does not call the provider when chat generation settings reference a stale sampler preset', async () => {
    const providerRequests = mockProviderSuccess('Should not be generated.');
    const app = buildApiApp();
    const chat = await createChat(app);

    await updateChatGenerationSettings(app, chat.id, {
      additionalInstructions: null,
      samplerPresetId: 'smoke-model-preset',
      systemPrompt: null,
      sampling: EMPTY_CHAT_SAMPLING_OVERRIDES,
    });
    await writeProviderSettings({
      activePresetId: 'default',
      modelPresetMap: {},
      samplerPresets: [
        {
          context_trim_strategy: 'trim_middle',
          id: 'default',
          max_context_length: 8192,
          max_length: 640,
          min_p: 0.03,
          name: 'Default',
          presence_penalty: 0.15,
          rep_pen: 1.08,
          rep_pen_range: 1024,
          temperature: 0.72,
          top_k: 42,
          top_p: 0.91,
        },
      ],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Do not call provider with stale settings.',
      },
    });
    const payload = ChatReplyGenerationErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(409);
    expect(payload).toMatchObject({
      code: 'invalid_chat_generation_settings',
      session: {
        messages: [
          {
            role: 'user',
            content: 'Do not call provider with stale settings.',
          },
        ],
      },
    });
    expect(providerRequests).toHaveLength(0);

    await app.close();
  });

  it('rejects prompt preview when chat generation settings reference a stale sampler preset', async () => {
    const providerRequests = mockProviderSuccess('Should not be generated.');
    const app = buildApiApp();
    const chat = await createChat(app);

    await updateChatGenerationSettings(app, chat.id, {
      additionalInstructions: null,
      samplerPresetId: 'smoke-model-preset',
      systemPrompt: null,
      sampling: EMPTY_CHAT_SAMPLING_OVERRIDES,
    });
    await writeProviderSettings({
      activePresetId: 'default',
      modelPresetMap: {},
      samplerPresets: [
        {
          context_trim_strategy: 'trim_middle',
          id: 'default',
          max_context_length: 8192,
          max_length: 640,
          min_p: 0.03,
          name: 'Default',
          presence_penalty: 0.15,
          rep_pen: 1.08,
          rep_pen_range: 1024,
          temperature: 0.72,
          top_k: 42,
          top_p: 0.91,
        },
      ],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        draftUserMessage: 'Do not preview stale settings.',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'invalid_chat_generation_settings',
      message: 'Chat sampler preset not found: smoke-model-preset',
    });
    expect(providerRequests).toHaveLength(0);

    await app.close();
  });

  it('binds builtin runtime sampler presets by the canonical scanned model name', async () => {
    const nestedModelPath = path.join(temporaryDataRoot, 'models', 'nested', 'secondary.gguf');
    await writeProviderSettings({
      backendMode: 'builtin',
      modelPresetMap: {
        'nested/secondary.gguf': 'smoke-model-preset',
      },
    });
    await writeDetachedRuntimeState(nestedModelPath);
    const providerRequests = mockProviderSuccess('Assistant reply from builtin runtime.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Use builtin canonical model.',
      },
    });

    expect(response.statusCode).toBe(200);
    // Builtin mode may additionally probe the runtime tokenize endpoint;
    // the completion call itself must stay a single request.
    const completionRequests = providerRequests.filter((request) => request.url.includes('/chat/completions'));
    expect(completionRequests).toHaveLength(1);
    expect(completionRequests[0]).toMatchObject({
      authorization: null,
      url: 'http://127.0.0.1:6006/v1/chat/completions',
    });
    expect(completionRequests[0]?.body).toMatchObject({
      ...MODEL_BOUND_SMOKE_SAMPLING,
      model: 'nested/secondary.gguf',
      stream: false,
    });

    await app.close();
  });

  it('persists the user message without an assistant reply when the provider fails', async () => {
    const providerRequests = mockProviderFailure();
    const app = buildApiApp();
    const chat = await createChat(app);

    await updateChatGenerationSettings(app, chat.id, {
      additionalInstructions: null,
      samplerPresetId: null,
      systemPrompt: 'Preserve this setting on provider failure.',
      sampling: EMPTY_CHAT_SAMPLING_OVERRIDES,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Persist this before provider failure.',
      },
    });
    const errorPayload = ChatReplyGenerationErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(502);
    expect(errorPayload).toMatchObject({
      code: 'provider_generation_failed',
      session: {
        messages: [
          {
            role: 'user',
            content: 'Persist this before provider failure.',
          },
        ],
        generationSettings: {
          systemPrompt: 'Preserve this setting on provider failure.',
        },
      },
    });
    expect(providerRequests).toHaveLength(1);

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual([
      {
        role: 'user',
        content: 'Persist this before provider failure.',
      },
    ]);

    await app.close();
  });

  it('persists the user message when provider endpoint resolution is unavailable', async () => {
    await writeProviderSettings({
      backendMode: 'builtin',
    });
    const providerRequests = mockProviderSuccess('Should not be called.');
    const app = buildApiApp();
    const chat = await createChat(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Keep this while provider is offline.',
      },
    });
    const errorPayload = ChatReplyGenerationErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(409);
    expect(errorPayload).toMatchObject({
      code: 'generation_provider_unavailable',
      session: {
        messages: [
          {
            role: 'user',
            content: 'Keep this while provider is offline.',
          },
        ],
      },
    });
    expect(providerRequests).toHaveLength(0);

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(getMessagesByRole(sessionPayload.messages)).toEqual([
      {
        role: 'user',
        content: 'Keep this while provider is offline.',
      },
    ]);

    await app.close();
  });

  it('refuses a cloud provider without a key or a model before calling it', async () => {
    const providerRequests = mockProviderSuccess('Should not be called.');
    const app = buildApiApp();
    const chat = await createChat(app);

    await writeProviderSettings({
      activeProvider: 'openai',
      backendMode: 'external',
      providerConfigs: { openai: { model: 'gpt-4o', url: 'https://api.openai.com/v1' } },
    });
    const withoutKey = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { chatId: chat.id, message: 'Привет.' },
    });

    expect(withoutKey.statusCode).toBe(409);
    expect(ChatReplyGenerationErrorResponseSchema.parse(withoutKey.json())).toMatchObject({
      code: 'generation_provider_unavailable',
      message: expect.stringContaining('API-ключ'),
    });

    await writeProviderSettings({
      providerConfigs: { openai: { apiKey: 'sk-test', url: 'https://api.openai.com/v1' } },
    });
    const withoutModel = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { chatId: chat.id, message: 'Ещё раз.' },
    });

    expect(withoutModel.statusCode).toBe(409);
    expect(ChatReplyGenerationErrorResponseSchema.parse(withoutModel.json())).toMatchObject({
      code: 'generation_provider_unavailable',
      message: expect.stringContaining('Модель'),
    });
    expect(providerRequests).toHaveLength(0);

    await app.close();
  });

  it('returns 404 for a missing chat without calling the provider', async () => {
    const providerRequests = mockProviderSuccess('Should not be called.');
    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: 'missing-chat',
        message: 'Hello?',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'chat_not_found',
    });
    expect(providerRequests).toHaveLength(0);

    await app.close();
  });
});
