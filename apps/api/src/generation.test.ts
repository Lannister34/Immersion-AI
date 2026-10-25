import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type ChatMessageDto,
  type ChatSamplingOverridesDto,
  CreateChatResponseSchema,
  GetChatSessionResponseSchema,
  type UpdateChatGenerationSettingsCommand,
  UploadChatAttachmentResponseSchema,
} from '@immersion/contracts/chats';
import {
  ActiveGenerationJobProblemSchema,
  ChatReplyGenerationErrorResponseSchema,
  ChatReplyGenerationResponseSchema,
  ChatReplyPromptPreviewResponseSchema,
  GenerationJobResponseSchema,
  GenerationReadinessResponseSchema,
  ListGenerationJobsResponseSchema,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { z } from 'zod';

import { appendChatMessages } from './modules/chats/index.js';
import { getProviderVisionProbe } from './modules/providers/index.js';
import { waitForGenerationJob } from './test-support/generation-jobs.js';
import { readProviderChatRequest } from './test-support/provider-chat-request.js';
import { openAiChatCompletion, openAiChatStream, providerFailure } from './test-support/provider-responses.js';
import { useTestApi } from './test-support/use-test-api.js';

const PROVIDER_URL = 'http://127.0.0.1:6006';
const CHAT_COMPLETIONS_URL = `${PROVIDER_URL}/v1/chat/completions`;
// TODO: count tokens on one port once each app owns its token counter (F-35)
const LLAMA_TOKENIZER_PORT = 6011;
const KOBOLD_TOKENIZER_PORT = 6012;
const NO_SAMPLING_OVERRIDES: ChatSamplingOverridesDto = {
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

describe('generation routes', () => {
  const api = useTestApi({ fixture: 'smoke' });
  let visionSupportProbe: MockInstance<ReturnType<typeof getProviderVisionProbe>['getVisionSupport']>;

  beforeEach(async () => {
    await api().settings.useExternalProvider({ url: PROVIDER_URL });
    // TODO: give the app its own vision probe instead of spying on the shared one (F-35)
    visionSupportProbe = vi.spyOn(getProviderVisionProbe(), 'getVisionSupport').mockResolvedValue('unknown');
  });

  function answerWith(content: string) {
    api().http.on('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion(content));
  }

  function isTokenizerRequest(line: string, runtimeUrl: string) {
    return line === `POST ${runtimeUrl}/tokenize` || line === `POST ${runtimeUrl}/api/extra/tokencount`;
  }

  function sentBody(index = 0) {
    return readProviderChatRequest(api().http, index);
  }

  async function providerSamplingOf(presetId: string) {
    const preset = await api().settings.samplerPreset(presetId);

    return {
      max_tokens: preset.max_length,
      min_p: preset.min_p,
      presence_penalty: preset.presence_penalty,
      rep_pen: preset.rep_pen,
      rep_pen_range: preset.rep_pen_range,
      temperature: preset.temperature,
      top_k: preset.top_k,
      top_p: preset.top_p,
    };
  }

  async function activePresetSampling() {
    const { activePresetId } = await api().settings.read();

    if (activePresetId === undefined) {
      throw new Error('The stored settings name no active sampler preset.');
    }

    return providerSamplingOf(activePresetId);
  }

  async function presetSamplingBoundTo(model: string) {
    const { modelPresetMap = {} } = await api().settings.read();
    const presetId = modelPresetMap[model];

    if (presetId === undefined) {
      throw new Error(`The stored settings bind no sampler preset to ${model}.`);
    }

    return providerSamplingOf(presetId);
  }

  async function keepOnlyTheDefaultSamplerPreset() {
    await api().settings.patch({
      activePresetId: 'default',
      modelPresetMap: {},
      samplerPresets: [await api().settings.samplerPreset('default')],
    });
  }

  async function createChat() {
    const createResponse = await api().app.inject({
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

  async function readTranscript(chatId: string) {
    const response = await api().app.inject({ method: 'GET', url: `/api/chats/${chatId}` });

    return getMessagesByRole(GetChatSessionResponseSchema.parse(response.json()).messages);
  }

  async function writeDetachedRuntimeState(modelPath: string, port = 6006, mmprojPath?: string | null) {
    await fs.writeFile(
      path.join(api().dataRoot, '.llm-server.json'),
      JSON.stringify(
        {
          ...(mmprojPath === undefined ? {} : { mmprojPath }),
          model: path.basename(modelPath),
          modelPath,
          // TODO: seed a fake runtime process instead of claiming the test process as llama-server (F-41)
          pid: process.pid,
          port,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  async function updateChatGenerationSettings(chatId: string, payload: UpdateChatGenerationSettingsCommand) {
    const response = await api().app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload,
    });

    expect(response.statusCode).toBe(200);
  }

  async function readReadiness() {
    const response = await api().app.inject({
      method: 'GET',
      url: '/api/generation/readiness',
    });

    expect(response.statusCode).toBe(200);

    return GenerationReadinessResponseSchema.parse(response.json());
  }

  it('reports generation readiness for a configured external provider with the vision support its probe found', async () => {
    visionSupportProbe.mockResolvedValue('supported');

    expect(await readReadiness()).toEqual({
      activeProvider: 'custom',
      issue: null,
      mode: 'external',
      runtime: null,
      status: 'ready',
      visionSupport: 'supported',
    });
    expect(visionSupportProbe).toHaveBeenCalledWith({
      baseUrl: PROVIDER_URL,
      model: 'smoke-model',
      provider: 'custom',
    });
  });

  it('blocks generation readiness when the external provider URL is missing', async () => {
    await api().settings.patch({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: {
        custom: {
          url: '   ',
        },
      },
    });

    expect(await readReadiness()).toMatchObject({
      issue: {
        code: 'external_provider_url_missing',
      },
      mode: 'external',
      status: 'blocked',
    });
  });

  it('blocks generation readiness when the external provider URL is invalid', async () => {
    await api().settings.patch({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: {
        custom: {
          url: 'not-a-url',
        },
      },
    });

    expect(await readReadiness()).toMatchObject({
      issue: {
        code: 'external_provider_url_invalid',
      },
      mode: 'external',
      status: 'blocked',
    });
  });

  it('blocks generation readiness when a cloud provider has no API key', async () => {
    await api().settings.patch({
      activeProvider: 'openai',
      backendMode: 'external',
      providerConfigs: {
        openai: {
          model: 'gpt-4o',
          url: 'https://api.openai.com/v1',
        },
      },
    });

    expect(await readReadiness()).toMatchObject({
      issue: {
        code: 'external_provider_api_key_missing',
        message: 'API-ключ провайдера не задан. Укажите его на странице API.',
      },
      mode: 'external',
      status: 'blocked',
    });
  });

  it('blocks generation readiness when builtin runtime is not running', async () => {
    await api().settings.patch({
      backendMode: 'builtin',
    });

    const payload = await readReadiness();

    expect(payload.mode).toBe('builtin');
    expect(payload.status).toBe('blocked');
    // TODO: pin builtin_runtime_not_installed once the runtime looks for llama-server in the test project (F-41)
    expect(payload.issue?.code).toMatch(/^builtin_/u);
    expect(payload.runtime).not.toBeNull();
    expect(api().http.requestLines()).toEqual([]);
  });

  it('leaves vision unknown while the built-in runtime is stopped, since there is nothing to ask', async () => {
    await api().settings.patch({
      backendMode: 'builtin',
    });

    const payload = await readReadiness();

    expect(payload.status).toBe('blocked');
    expect(payload.visionSupport).toBe('unknown');
  });

  it('reports built-in vision by the --mmproj launch recorded for the running server, not by the model file', async () => {
    await api().settings.patch({ backendMode: 'builtin' });
    const modelPath = path.join(api().dataRoot, 'qwen-vl.gguf');
    await fs.writeFile(modelPath, 'gguf', 'utf8');

    await writeDetachedRuntimeState(modelPath, 5001, null);
    const withoutProjector = await readReadiness();

    expect(withoutProjector.status).toBe('ready');
    expect(withoutProjector.visionSupport).toBe('unsupported');

    await writeDetachedRuntimeState(modelPath, 5001, path.join(api().dataRoot, 'mmproj-qwen-vl.gguf'));
    const withProjector = await readReadiness();

    expect(withProjector.visionSupport).toBe('supported');
    expect(api().http.requestLines()).toEqual([]);
  });

  it('keeps prompt preview available when builtin generation is blocked', async () => {
    await api().settings.patch({
      backendMode: 'builtin',
      responseLanguage: 'ru',
      systemPromptTemplate: 'Blocked runtime global prompt that must not leak.',
    });
    answerWith('Blocked preview must not call provider.');
    const chat = await createChat();
    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toEqual([]);
  });

  it('reports approximate token counting in preview without tokenizing through an external provider', async () => {
    answerWith('Preview must not call provider.');
    const chat = await createChat();
    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toEqual([]);
  });

  it('reports exact token counting in preview via the llama-server tokenize endpoint', async () => {
    const tokenizerUrl = `http://127.0.0.1:${LLAMA_TOKENIZER_PORT}`;
    await api().settings.patch({
      backendMode: 'builtin',
    });
    await writeDetachedRuntimeState(path.join(api().dataRoot, 'models', 'sandbox.gguf'), LLAMA_TOKENIZER_PORT);
    api().http.on('POST', `${tokenizerUrl}/tokenize`, (request) => {
      const { content } = request.json(z.object({ content: z.string() }));

      return Response.json({ tokens: Array.from({ length: Math.ceil(content.length / 3) }, (_, index) => index) });
    });

    const chat = await createChat();
    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toContain(`POST ${tokenizerUrl}/tokenize`);
    expect(
      api()
        .http.requestLines()
        .filter((line) => line !== `POST ${tokenizerUrl}/tokenize`),
    ).toEqual([]);
  });

  it('reports exact token counting in preview via the KoboldCpp tokencount endpoint', async () => {
    const tokenizerUrl = `http://127.0.0.1:${KOBOLD_TOKENIZER_PORT}`;
    await api().settings.patch({
      backendMode: 'builtin',
    });
    await writeDetachedRuntimeState(path.join(api().dataRoot, 'models', 'sandbox.gguf'), KOBOLD_TOKENIZER_PORT);
    api().http.on('POST', `${tokenizerUrl}/api/extra/tokencount`, (request) => {
      const { prompt } = request.json(z.object({ prompt: z.string() }));

      return Response.json({ value: Math.ceil(prompt.length / 3) });
    });

    const chat = await createChat();
    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toContain(`POST ${tokenizerUrl}/api/extra/tokencount`);
    expect(
      api()
        .http.requestLines()
        .filter((line) => !isTokenizerRequest(line, tokenizerUrl)),
    ).toEqual([]);
  });

  it('streams a job reply when streaming is enabled and stores the joined text', async () => {
    api().http.on('POST', CHAT_COMPLETIONS_URL, () =>
      openAiChatStream([{ content: 'Пер' }, { content: 'вый ' }, { content: 'кусок.' }]),
    );

    const chat = await createChat();
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId: chat.id, message: 'Расскажи что-нибудь.', mode: 'reply' },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(202);

    await waitForGenerationJob(api(), payload.job.id, 'completed');

    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    expect(sentBody()).toMatchObject({ stream: true });
    expect(await readTranscript(chat.id)).toEqual([
      { role: 'user', content: 'Расскажи что-нибудь.' },
      { role: 'assistant', content: 'Первый кусок.' },
    ]);
  });

  it('asks the provider for a whole reply when the profile turns streaming off', async () => {
    await api().settings.patch({ streamingEnabled: false });
    answerWith('Целый ответ.');
    const chat = await createChat();
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId: chat.id, message: 'Расскажи что-нибудь.', mode: 'reply' },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());

    await waitForGenerationJob(api(), payload.job.id, 'completed');

    expect(sentBody()).toMatchObject({ stream: false });
  });

  it('keeps the model reasoning out of the reply and stores it beside the message', async () => {
    answerWith('<think>Сначала прикину тон.</think>Привет! Чем помочь?');
    const chat = await createChat();

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { chatId: chat.id, message: 'Привет.' },
    });
    const payload = ChatReplyGenerationResponseSchema.parse(response.json());
    const assistantMessage = payload.session.messages.at(-1);

    expect(response.statusCode).toBe(200);
    expect(assistantMessage?.content).toBe('Привет! Чем помочь?');
    expect(assistantMessage?.reasoning).toBe('Сначала прикину тон.');

    const sessionResponse = await api().app.inject({ method: 'GET', url: `/api/chats/${chat.id}` });
    const stored = GetChatSessionResponseSchema.parse(sessionResponse.json()).messages.at(-1);

    expect(stored?.content).toBe('Привет! Чем помочь?');
    expect(stored?.reasoning).toBe('Сначала прикину тон.');
  });

  it('sends an attached image and its text as parts of one OpenAI user message', async () => {
    answerWith('Вижу градиент.');
    const chat = await createChat();
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex',
    );
    const uploadResponse = await api().app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/attachments`,
      payload: { contentBase64: png.toString('base64'), mimeType: 'image/png' },
    });
    const attachmentId = UploadChatAttachmentResponseSchema.parse(uploadResponse.json()).attachment.id;

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { attachmentIds: [attachmentId], chatId: chat.id, message: 'Что на картинке?' },
    });

    expect(response.statusCode).toBe(200);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);

    const userMessage = sentBody().messages.find((message) => message.role === 'user');

    expect(userMessage?.content).toEqual([
      { text: 'Что на картинке?', type: 'text' },
      { image_url: { url: `data:image/png;base64,${png.toString('base64')}` }, type: 'image_url' },
    ]);
  });

  it('refuses an attachment the chat does not have before storing the user message', async () => {
    answerWith('Не должно вызываться.');
    const chat = await createChat();

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { attachmentIds: ['missing.png'], chatId: chat.id, message: 'Что на картинке?' },
    });
    const sessionResponse = await api().app.inject({ method: 'GET', url: `/api/chats/${chat.id}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_attachment_not_found' });
    expect(GetChatSessionResponseSchema.parse(sessionResponse.json()).messages).toEqual([]);
    expect(api().http.requestLines()).toEqual([]);
  });

  it('calls the active provider without streaming and persists the user message with the assistant reply', async () => {
    answerWith('Assistant reply from provider.');
    const chat = await createChat();
    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    expect(api().http.requests[0]?.headers.get('authorization')).toBe('Bearer secret-token');
    expect(sentBody()).toMatchObject({
      ...(await presetSamplingBoundTo('smoke-model')),
      messages: expect.arrayContaining([
        {
          role: 'user',
          content: 'Hello model.',
        },
      ]),
      model: 'smoke-model',
      stream: false,
    });
    const submittedMessages = sentBody().messages.filter(
      (message) => message.role === 'user' && message.content === 'Hello model.',
    );

    expect(submittedMessages).toHaveLength(1);
    expect(await readTranscript(chat.id)).toEqual(getMessagesByRole(payload.session.messages));
  });

  it('previews a generic chat reply without leaking global RP prompt context or persisting the draft', async () => {
    await api().settings.patch({
      responseLanguage: 'ru',
      systemPromptTemplate: 'Roleplay prompt for {{user}}. {{#if userPersona}}Persona: {{userPersona}}{{/if}}',
      userName: 'Alex',
      userPersona: 'Careful tester.',
    });
    answerWith('Preview must not call provider.');
    const chat = await createChat();
    const response = await api().app.inject({
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
    expect(JSON.stringify(payload)).not.toContain(PROVIDER_URL);
    expect(api().http.requestLines()).toEqual([]);
    expect(await readTranscript(chat.id)).toEqual([]);
  });

  it('previews the prompt with character description, personality, per-card scenario and seeded first message for a character chat', async () => {
    const charactersDir = path.join(api().dataRoot, 'characters');
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

    const createChatResponse = await api().app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { characterId: 'Aria.json' },
    });
    const createdChat = CreateChatResponseSchema.parse(createChatResponse.json()).chat;

    const previewResponse = await api().app.inject({
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
    expect(
      preview.request.messages.some(
        (m) => m.role === 'assistant' && m.content.includes('Привет, ты впервые в студии?'),
      ),
    ).toBe(true);
  });

  it('injects scenario content into the prompt for a scenario-bound chat', async () => {
    const scenariosDir = path.join(api().dataRoot, 'scenarios');
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

    const createResponse = await api().app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { scenarioId: 'Ice training.json' },
    });
    const chatPayload = CreateChatResponseSchema.parse(createResponse.json());
    expect(createResponse.statusCode).toBe(201);
    expect(chatPayload.chat.scenarioId).toBe('Ice training.json');
    expect(chatPayload.chat.scenarioName).toBe('Ice training');
    expect(chatPayload.chat.title).toBe('Ice training');

    const previewResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: { chatId: chatPayload.chat.id, draftUserMessage: 'Start.' },
    });
    const preview = ChatReplyPromptPreviewResponseSchema.parse(previewResponse.json());
    const systemMessage = preview.request.messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('figure skater practises quads');
  });

  it('injects matching lorebook entries into the prompt when keys are mentioned', async () => {
    const worldsDir = path.join(api().dataRoot, 'worlds');
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

    const createResponse = await api().app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { lorebookIds: ['Studio.json'], title: 'lorebook chat' },
    });
    const chatPayload = CreateChatResponseSchema.parse(createResponse.json());
    expect(createResponse.statusCode).toBe(201);

    const previewResponse = await api().app.inject({
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
  });

  it('keeps the generic helper prompt for chats without a character', async () => {
    const chat = await createChat();

    const previewResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: { chatId: chat.id, draftUserMessage: 'Plain question.' },
    });
    const preview = ChatReplyPromptPreviewResponseSchema.parse(previewResponse.json());

    expect(previewResponse.statusCode).toBe(200);
    expect(preview.diagnostics.systemPromptIncluded).toBe(false);
    expect(preview.diagnostics.systemMessageCount).toBe(0);
  });

  it('previews the prompt with an edited transcript message via messageOverrides', async () => {
    answerWith('Setup reply.');
    const chat = await createChat();

    const firstReplyResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Original prompt.',
      },
    });
    expect(firstReplyResponse.statusCode).toBe(200);

    const previewResponse = await api().app.inject({
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
    expect((await readTranscript(chat.id))[0]?.content).toBe('Original prompt.');
  });

  it('returns 404 when previewing with an out-of-range messageOverride index', async () => {
    const chat = await createChat();

    const previewResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        messageOverrides: [{ messageIndex: 9, content: 'no such message' }],
      },
    });

    expect(previewResponse.statusCode).toBe(404);
    expect(previewResponse.json()).toMatchObject({ code: 'chat_message_not_found' });
  });

  it('matches previewed provider payload to the real generation payload for the same draft', async () => {
    answerWith('Assistant reply after preview.');
    const chat = await createChat();
    const previewResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: {
        chatId: chat.id,
        draftUserMessage: 'Compare preview to generation.',
      },
    });
    const preview = ChatReplyPromptPreviewResponseSchema.parse(previewResponse.json());
    const generationResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Compare preview to generation.',
      },
    });
    const generationRequest = sentBody();

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
  });

  it('does not render the global settings prompt template for generic chat replies', async () => {
    await api().settings.patch({
      responseLanguage: 'ru',
      systemPromptTemplate: 'Roleplay prompt for {{user}}. {{#if userPersona}}Persona: {{userPersona}}{{/if}}',
      userName: 'Alex',
      userPersona: 'Careful tester.',
    });
    answerWith('Assistant reply without global prompt.');
    const chat = await createChat();
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Plain chat message.',
      },
    });

    expect(response.statusCode).toBe(200);
    const requestBody = sentBody();
    const submittedContent = requestBody.messages.map((message) => message.content).join('\n');

    expect(requestBody.messages.filter((message) => message.role === 'system')).toEqual([]);
    expect(submittedContent).toContain('Plain chat message.');
    expect(submittedContent).not.toContain('Roleplay prompt');
    expect(submittedContent).not.toContain('Careful tester.');
    expect(submittedContent).not.toContain('Answer in Russian');
  });

  it('starts a chat reply job without blocking provider completion', async () => {
    const provider = api().http.hold('POST', CHAT_COMPLETIONS_URL);
    const chat = await createChat();
    const response = await api().app.inject({
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

    await provider.started;

    const jobsResponse = await api().app.inject({
      method: 'GET',
      url: `/api/generation/jobs?chatId=${chat.id}`,
    });
    const jobsPayload = ListGenerationJobsResponseSchema.parse(jobsResponse.json());

    expect(jobsPayload.items).toEqual([expect.objectContaining({ id: payload.job.id, status: 'running' })]);

    provider.release(openAiChatCompletion('Async assistant reply.'));

    await waitForGenerationJob(api(), payload.job.id, 'completed');

    expect(await readTranscript(chat.id)).toEqual([
      {
        role: 'user',
        content: 'Start async reply.',
      },
      {
        role: 'assistant',
        content: 'Async assistant reply.',
      },
    ]);
  });

  it('cancels a chat reply job without appending an assistant reply', async () => {
    const provider = api().http.hold('POST', CHAT_COMPLETIONS_URL);
    const chat = await createChat();
    const startResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        message: 'Cancel async reply.',
      },
    });
    const startPayload = StartChatReplyGenerationJobResponseSchema.parse(startResponse.json());

    const providerRequest = await provider.started;

    const cancelResponse = await api().app.inject({
      method: 'POST',
      url: `/api/generation/jobs/${startPayload.job.id}/cancel`,
    });
    const cancelPayload = GenerationJobResponseSchema.parse(cancelResponse.json());

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelPayload.job.status).toBe('canceled');
    expect(providerRequest.signal?.aborted).toBe(true);

    await waitForGenerationJob(api(), startPayload.job.id, 'canceled');

    expect(await readTranscript(chat.id)).toEqual([
      {
        role: 'user',
        content: 'Cancel async reply.',
      },
    ]);
  });

  it('returns 404 generation_job_not_found for an unknown job on get, cancel and events', async () => {
    const unknownJobId = '00000000-0000-4000-8000-000000000000';
    const requests = [
      { method: 'GET', url: `/api/generation/jobs/${unknownJobId}` },
      { method: 'POST', url: `/api/generation/jobs/${unknownJobId}/cancel` },
      { method: 'GET', url: `/api/generation/jobs/${unknownJobId}/events` },
    ] as const;

    for (const request of requests) {
      const response = await api().app.inject(request);

      expect(response.statusCode, request.url).toBe(404);
      expect(response.json(), request.url).toEqual({
        code: 'generation_job_not_found',
        message: 'Generation job not found.',
      });
    }
  });

  it('rejects a job id that is not a uuid with 400 validation_error before looking the job up', async () => {
    const response = await api().app.inject({ method: 'GET', url: '/api/generation/jobs/not-a-job/events' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
  });

  it('rejects an invalid job command with 400 validation_error without touching the chat', async () => {
    const chat = await createChat();
    const invalidCommands = [
      { url: '/api/generation/chat-reply-jobs', payload: { chatId: chat.id, message: '   ' } },
      { url: '/api/generation/chat-reply-jobs/regenerate', payload: { chatId: 42 } },
    ];

    for (const { payload, url } of invalidCommands) {
      const response = await api().app.inject({ method: 'POST', url, payload });

      expect(response.statusCode, url).toBe(400);
      expect(response.json(), url).toMatchObject({ code: 'validation_error' });
    }

    const jobsResponse = await api().app.inject({ method: 'GET', url: `/api/generation/jobs?chatId=${chat.id}` });

    expect(ListGenerationJobsResponseSchema.parse(jobsResponse.json()).items).toEqual([]);
    expect(await readTranscript(chat.id)).toEqual([]);
    expect(api().http.requestLines()).toEqual([]);
  });

  it('answers a second job for the same chat with 409 and the active job in a contracted body', async () => {
    const provider = api().http.hold('POST', CHAT_COMPLETIONS_URL);
    const chat = await createChat();
    const firstResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        message: 'First active job.',
      },
    });
    const firstPayload = StartChatReplyGenerationJobResponseSchema.parse(firstResponse.json());

    await provider.started;

    const secondResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        message: 'Second active job.',
      },
    });

    expect(secondResponse.statusCode).toBe(409);
    expect(ActiveGenerationJobProblemSchema.parse(secondResponse.json())).toEqual({
      code: 'active_generation_job_exists',
      job: expect.objectContaining({ chatId: chat.id, id: firstPayload.job.id, status: 'running' }),
      message: 'An active generation job already exists for this chat.',
    });
    expect(await readTranscript(chat.id)).toEqual([
      {
        role: 'user',
        content: 'First active job.',
      },
    ]);

    await api().app.inject({
      method: 'POST',
      url: `/api/generation/jobs/${firstPayload.job.id}/cancel`,
    });
  });

  it('regenerates the last assistant reply by dropping it and producing a new one from the same user turn', async () => {
    api().http.once('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('First reply.'));
    api().http.once('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('Regenerated reply.'));
    const chat = await createChat();

    const firstResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Tell me a joke.',
      },
    });
    expect(firstResponse.statusCode).toBe(200);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);

    const regenerateResponse = await api().app.inject({
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

    await waitForGenerationJob(api(), regeneratePayload.job.id, 'completed');

    expect(await readTranscript(chat.id)).toEqual([
      { role: 'user', content: 'Tell me a joke.' },
      { role: 'assistant', content: 'Regenerated reply.' },
    ]);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`, `POST ${CHAT_COMPLETIONS_URL}`]);
    const userTurns = sentBody(1).messages.filter(
      (message) => message.role === 'user' && message.content === 'Tell me a joke.',
    );
    expect(userTurns).toHaveLength(1);
  });

  it('refuses to regenerate when the last message is not an assistant reply', async () => {
    const chat = await createChat();

    const response = await api().app.inject({
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
  });

  it('refuses to regenerate while a continue job is active, keeping the reply being continued', async () => {
    const provider = api().http.hold('POST', CHAT_COMPLETIONS_URL);
    const chat = await createChat();
    await appendChatMessages(chat.id, [
      { role: 'user', content: 'Расскажи про обжиг керамики.', createdAt: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', content: 'Обжиг превращает глину в керамику,', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);
    const continueResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId: chat.id, mode: 'continue' },
    });
    const continuePayload = StartChatReplyGenerationJobResponseSchema.parse(continueResponse.json());
    await provider.started;

    const regenerateResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs/regenerate',
      payload: { chatId: chat.id },
    });

    expect(regenerateResponse.statusCode).toBe(409);
    expect(regenerateResponse.json()).toMatchObject({
      code: 'active_generation_job_exists',
      job: { id: continuePayload.job.id },
    });
    expect(await readTranscript(chat.id)).toEqual([
      { role: 'user', content: 'Расскажи про обжиг керамики.' },
      { role: 'assistant', content: 'Обжиг превращает глину в керамику,' },
    ]);

    provider.release(openAiChatCompletion('и это делает её прочной.'));
    await waitForGenerationJob(api(), continuePayload.job.id, 'completed');

    expect(await readTranscript(chat.id)).toEqual([
      { role: 'user', content: 'Расскажи про обжиг керамики.' },
      { role: 'assistant', content: 'Обжиг превращает глину в керамику, и это делает её прочной.' },
    ]);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
  });

  it('refuses to regenerate an assistant reply with no user turn before it, keeping the greeting', async () => {
    answerWith('Не должно вызываться.');
    const chat = await createChat();
    await appendChatMessages(chat.id, [
      { role: 'assistant', content: 'Добро пожаловать на маяк.', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs/regenerate',
      payload: { chatId: chat.id },
    });
    const jobsResponse = await api().app.inject({ method: 'GET', url: `/api/generation/jobs?chatId=${chat.id}` });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'no_assistant_message_to_regenerate',
      message: 'Перегенерировать нечего: чат не заканчивается ответом персонажа на сообщение пользователя.',
    });
    expect(await readTranscript(chat.id)).toEqual([{ role: 'assistant', content: 'Добро пожаловать на маяк.' }]);
    expect(ListGenerationJobsResponseSchema.parse(jobsResponse.json()).items).toEqual([]);
    expect(api().http.requestLines()).toEqual([]);
  });

  it.each([
    {
      code: 'generation_provider_unavailable',
      makeGenerationImpossible: async () => {
        await api().settings.patch({ backendMode: 'builtin' });
      },
    },
    {
      code: 'invalid_chat_generation_settings',
      makeGenerationImpossible: async (chatId: string) => {
        await updateChatGenerationSettings(chatId, {
          additionalInstructions: null,
          samplerPresetId: 'smoke-model-preset',
          systemPrompt: null,
          sampling: NO_SAMPLING_OVERRIDES,
        });
        await keepOnlyTheDefaultSamplerPreset();
      },
    },
  ])('refuses to regenerate with $code before deleting the reply', async ({ code, makeGenerationImpossible }) => {
    answerWith('Не должно вызываться.');
    const chat = await createChat();
    await appendChatMessages(chat.id, [
      { role: 'user', content: 'Расскажи анекдот.', createdAt: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', content: 'Заходит как-то улитка в бар.', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);
    await makeGenerationImpossible(chat.id);

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs/regenerate',
      payload: { chatId: chat.id },
    });
    const jobsResponse = await api().app.inject({ method: 'GET', url: `/api/generation/jobs?chatId=${chat.id}` });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code });
    expect(await readTranscript(chat.id)).toEqual([
      { role: 'user', content: 'Расскажи анекдот.' },
      { role: 'assistant', content: 'Заходит как-то улитка в бар.' },
    ]);
    expect(ListGenerationJobsResponseSchema.parse(jobsResponse.json()).items).toEqual([]);
    expect(api().http.requestLines()).toEqual([]);
  });

  it('regenerates every trailing assistant message in one step from the user turn before them', async () => {
    answerWith('Новый ответ.');
    const chat = await createChat();
    await appendChatMessages(chat.id, [
      { role: 'user', content: 'Первый вопрос.', createdAt: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', content: 'Первый ответ.', createdAt: '2026-01-01T00:00:01.000Z' },
      { role: 'user', content: 'Второй вопрос.', createdAt: '2026-01-01T00:00:02.000Z' },
      { role: 'assistant', content: 'Начало ответа.', createdAt: '2026-01-01T00:00:03.000Z' },
      { role: 'assistant', content: 'Конец ответа.', createdAt: '2026-01-01T00:00:04.000Z' },
    ]);

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs/regenerate',
      payload: { chatId: chat.id },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(202);
    expect(getMessagesByRole(payload.session.messages)).toEqual([
      { role: 'user', content: 'Первый вопрос.' },
      { role: 'assistant', content: 'Первый ответ.' },
      { role: 'user', content: 'Второй вопрос.' },
    ]);

    await waitForGenerationJob(api(), payload.job.id, 'completed');

    expect(await readTranscript(chat.id)).toEqual([
      { role: 'user', content: 'Первый вопрос.' },
      { role: 'assistant', content: 'Первый ответ.' },
      { role: 'user', content: 'Второй вопрос.' },
      { role: 'assistant', content: 'Новый ответ.' },
    ]);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
  });

  it('continues the last assistant reply in place, sending it unchanged with a continue instruction in the profile language', async () => {
    answerWith('Это и делает её прочной.');
    const chat = await createChat();
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

    const response = await api().app.inject({
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
    expect(payload.session.messages).toHaveLength(2);

    await waitForGenerationJob(api(), payload.job.id, 'completed');

    expect(await readTranscript(chat.id)).toEqual([
      { role: 'user', content: 'Расскажи про обжиг керамики.' },
      {
        role: 'assistant',
        content: 'Обжиг превращает глину в керамику при высокой температуре, и Это и делает её прочной.',
      },
    ]);

    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    const promptMessages = sentBody().messages;
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
    expect(trailingInstruction?.content).toContain('Write the continuation in Russian.');
  });

  it('counts the continue instruction inside the context budget, trimming older messages to fit it', async () => {
    answerWith('и это делает её прочной.');
    const chat = await createChat();
    await appendChatMessages(chat.id, [
      {
        role: 'user',
        content: 'OLD_CONTEXT '.repeat(10),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        role: 'assistant',
        content: 'PARTIAL_REPLY',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ]);
    await updateChatGenerationSettings(chat.id, {
      additionalInstructions: null,
      samplerPresetId: null,
      systemPrompt: null,
      sampling: {
        ...NO_SAMPLING_OVERRIDES,
        contextTrimStrategy: 'trim_start',
        maxContextLength: 74,
        maxTokens: 24,
      },
    });

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId: chat.id, mode: 'continue' },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());
    await waitForGenerationJob(api(), payload.job.id, 'completed');
    const promptMessages = sentBody().messages;

    expect(promptMessages.map((message) => message.content).join('\n')).not.toContain('OLD_CONTEXT');
    expect(promptMessages.at(-2)?.content).toBe('PARTIAL_REPLY');
    expect(promptMessages.at(-1)?.content).toContain('Continue your previous reply');
  });

  it('answers the last user message without appending a new one', async () => {
    answerWith('Ответ на уже сохранённое сообщение.');
    const chat = await createChat();
    await appendChatMessages(chat.id, [
      {
        role: 'user',
        content: 'Вопрос без ответа.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        mode: 'answer',
      },
    });

    expect(response.statusCode).toBe(202);
    const startPayload = StartChatReplyGenerationJobResponseSchema.parse(response.json());
    await waitForGenerationJob(api(), startPayload.job.id, 'completed');

    expect((await readTranscript(chat.id)).map((message) => message.content)).toEqual([
      'Вопрос без ответа.',
      'Ответ на уже сохранённое сообщение.',
    ]);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
  });

  it('refuses to answer when the last message is not a non-empty user message', async () => {
    answerWith('Should not be called.');

    const emptyChat = await createChat();
    const emptyChatResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: emptyChat.id,
        mode: 'answer',
      },
    });

    expect(emptyChatResponse.statusCode).toBe(409);
    expect(emptyChatResponse.json()).toMatchObject({ code: 'nothing_to_answer' });

    const chat = await createChat();
    await appendChatMessages(chat.id, [
      {
        role: 'assistant',
        content: 'Последним пишет персонаж.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        mode: 'answer',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'nothing_to_answer' });
    expect(api().http.requestLines()).toEqual([]);
  });

  it('refuses to continue when the last message is not a non-empty assistant reply', async () => {
    answerWith('Should not be called.');

    const emptyChat = await createChat();
    const emptyChatResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: emptyChat.id,
        mode: 'continue',
      },
    });

    expect(emptyChatResponse.statusCode).toBe(409);
    expect(emptyChatResponse.json()).toMatchObject({ code: 'nothing_to_continue' });

    const chat = await createChat();
    await appendChatMessages(chat.id, [
      {
        role: 'user',
        content: 'Последним пишет пользователь.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        mode: 'continue',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'nothing_to_continue' });
    expect(api().http.requestLines()).toEqual([]);
    expect(await readTranscript(chat.id)).toHaveLength(1);
  });

  it.each(['answer', 'continue'] as const)('refuses to %s an empty chat without leaving a job behind', async (mode) => {
    answerWith('Не должно вызываться.');
    const chat = await createChat();

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId: chat.id, mode },
    });
    const jobsResponse = await api().app.inject({ method: 'GET', url: `/api/generation/jobs?chatId=${chat.id}` });

    expect(response.statusCode).toBe(409);
    expect(ListGenerationJobsResponseSchema.parse(jobsResponse.json()).items).toEqual([]);
    expect(api().http.requestLines()).toEqual([]);
  });

  it('fails the continue job without touching the transcript when the user posts a message mid-generation', async () => {
    const chat = await createChat();
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

    api().http.on('POST', CHAT_COMPLETIONS_URL, async () => {
      await appendChatMessages(chat.id, [
        {
          role: 'user',
          content: 'Я успел написать раньше продолжения.',
          createdAt: '2026-01-01T00:00:02.000Z',
        },
      ]);

      return openAiChatCompletion('потерянное продолжение.');
    });

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: {
        chatId: chat.id,
        mode: 'continue',
      },
    });
    const payload = StartChatReplyGenerationJobResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(202);

    const failedJob = await waitForGenerationJob(api(), payload.job.id, 'failed');
    expect(failedJob.error).toMatchObject({ code: 'chat_changed_during_generation' });

    expect(await readTranscript(chat.id)).toEqual([
      { role: 'user', content: 'Расскажи про обжиг керамики.' },
      { role: 'assistant', content: 'Обжиг превращает глину в керамику при высокой температуре, и' },
      { role: 'user', content: 'Я успел написать раньше продолжения.' },
    ]);
  });

  it('returns 404 when regenerating a missing chat', async () => {
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs/regenerate',
      payload: {
        chatId: 'never-existed',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_not_found' });
  });

  it('falls back to the active sampler preset when the provider model has no binding', async () => {
    await api().settings.useExternalProvider({ url: PROVIDER_URL, model: 'unbound-model' });
    answerWith('Assistant reply from unbound provider.');
    const chat = await createChat();
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Use active preset.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    expect(sentBody()).toMatchObject({
      ...(await activePresetSampling()),
      model: 'unbound-model',
      stream: false,
    });
  });

  it('applies chat-owned generation settings over model-bound sampler presets', async () => {
    await api().settings.patch({
      responseLanguage: 'none',
      systemPromptTemplate: 'Global template that must not win for {{user}}.',
      userName: 'Prompt Tester',
    });
    answerWith('Assistant reply with chat overrides.');
    const chat = await createChat();

    await updateChatGenerationSettings(chat.id, {
      additionalInstructions: null,
      samplerPresetId: 'default',
      systemPrompt: 'Custom system prompt for this chat.',
      sampling: {
        ...NO_SAMPLING_OVERRIDES,
        maxContextLength: 4096,
        maxTokens: 222,
        temperature: 0.55,
      },
    });

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Use chat settings.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    expect(sentBody()).toMatchObject({
      ...(await providerSamplingOf('default')),
      max_tokens: 222,
      model: 'smoke-model',
      stream: false,
      temperature: 0.55,
    });
    const systemMessages = sentBody().messages.filter((message) => message.role === 'system');

    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0]?.content).toContain('Custom system prompt for this chat.');
    expect(systemMessages[0]?.content).not.toContain('Global template that must not win');
  });

  it('previews explicit chat system prompts without mixing in the global template', async () => {
    await api().settings.patch({
      responseLanguage: 'none',
      systemPromptTemplate: 'Global template that must not win for {{user}}.',
      userName: 'Prompt Tester',
    });
    const chat = await createChat();

    await updateChatGenerationSettings(chat.id, {
      additionalInstructions: null,
      samplerPresetId: null,
      systemPrompt: 'Custom system prompt for {{user}}.',
      sampling: NO_SAMPLING_OVERRIDES,
    });

    const response = await api().app.inject({
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
  });

  it('applies effective generation settings before prompt context budgeting', async () => {
    await api().settings.patch({
      responseLanguage: 'none',
      systemPromptTemplate: 'Short prompt.',
    });
    answerWith('Assistant reply after prompt budgeting.');
    const chat = await createChat();

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
    await updateChatGenerationSettings(chat.id, {
      additionalInstructions: null,
      samplerPresetId: null,
      systemPrompt: null,
      sampling: {
        ...NO_SAMPLING_OVERRIDES,
        contextTrimStrategy: 'trim_start',
        maxContextLength: 48,
        maxTokens: 24,
      },
    });

    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'LATEST_USER_MESSAGE stays.',
      },
    });
    const submittedContent = sentBody()
      .messages.map((message) => message.content)
      .join('\n');

    expect(response.statusCode).toBe(200);
    expect(submittedContent).not.toContain('OLD_CONTEXT');
    expect(submittedContent).not.toContain('OLD_ASSISTANT');
    expect(submittedContent).toContain('LATEST_USER_MESSAGE stays.');
  });

  it('ignores stale sampler bindings and uses the active preset', async () => {
    await api().settings.patch({
      modelPresetMap: {
        'smoke-model': 'missing-preset',
      },
    });
    answerWith('Assistant reply with active preset.');
    const chat = await createChat();
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Ignore stale binding.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    expect(sentBody()).toMatchObject({
      ...(await activePresetSampling()),
      model: 'smoke-model',
      stream: false,
    });
  });

  it('falls back to the active sampler preset when provider model is blank', async () => {
    await api().settings.useExternalProvider({ url: PROVIDER_URL, model: '   ' });
    answerWith('Assistant reply with default transport model.');
    const chat = await createChat();
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Use fallback model and active preset.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    expect(sentBody()).toMatchObject({
      ...(await activePresetSampling()),
      model: 'local-model',
      stream: false,
    });
  });

  it('does not call the provider when chat generation settings reference a stale sampler preset', async () => {
    answerWith('Should not be generated.');
    const chat = await createChat();

    await updateChatGenerationSettings(chat.id, {
      additionalInstructions: null,
      samplerPresetId: 'smoke-model-preset',
      systemPrompt: null,
      sampling: NO_SAMPLING_OVERRIDES,
    });
    await keepOnlyTheDefaultSamplerPreset();

    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toEqual([]);
  });

  it('rejects prompt preview when chat generation settings reference a stale sampler preset', async () => {
    answerWith('Should not be generated.');
    const chat = await createChat();

    await updateChatGenerationSettings(chat.id, {
      additionalInstructions: null,
      samplerPresetId: 'smoke-model-preset',
      systemPrompt: null,
      sampling: NO_SAMPLING_OVERRIDES,
    });
    await keepOnlyTheDefaultSamplerPreset();

    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toEqual([]);
  });

  it('binds builtin runtime sampler presets by the canonical scanned model name in a single completion request', async () => {
    const nestedModelPath = path.join(api().dataRoot, 'models', 'nested', 'secondary.gguf');
    await api().settings.patch({
      backendMode: 'builtin',
      modelPresetMap: {
        'nested/secondary.gguf': 'smoke-model-preset',
      },
    });
    await writeDetachedRuntimeState(nestedModelPath);
    answerWith('Assistant reply from builtin runtime.');
    const chat = await createChat();
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: {
        chatId: chat.id,
        message: 'Use builtin canonical model.',
      },
    });

    const completionIndex = api().http.requestLines().indexOf(`POST ${CHAT_COMPLETIONS_URL}`);

    expect(response.statusCode).toBe(200);
    expect(
      api()
        .http.requestLines()
        .filter((line) => !isTokenizerRequest(line, PROVIDER_URL)),
    ).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    expect(api().http.requests[completionIndex]?.headers.get('authorization')).toBeNull();
    expect(sentBody(completionIndex)).toMatchObject({
      ...(await presetSamplingBoundTo('nested/secondary.gguf')),
      model: 'nested/secondary.gguf',
      stream: false,
    });
  });

  it('persists the user message without an assistant reply when the provider fails', async () => {
    api().http.on('POST', CHAT_COMPLETIONS_URL, () => providerFailure());
    const chat = await createChat();

    await updateChatGenerationSettings(chat.id, {
      additionalInstructions: null,
      samplerPresetId: null,
      systemPrompt: 'Preserve this setting on provider failure.',
      sampling: NO_SAMPLING_OVERRIDES,
    });

    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
    expect(await readTranscript(chat.id)).toEqual([
      {
        role: 'user',
        content: 'Persist this before provider failure.',
      },
    ]);
  });

  it('persists the user message when provider endpoint resolution is unavailable', async () => {
    await api().settings.patch({
      backendMode: 'builtin',
    });
    answerWith('Should not be called.');
    const chat = await createChat();
    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toEqual([]);
    expect(await readTranscript(chat.id)).toEqual([
      {
        role: 'user',
        content: 'Keep this while provider is offline.',
      },
    ]);
  });

  it('refuses a cloud provider without a key or a model before calling it', async () => {
    answerWith('Should not be called.');
    const chat = await createChat();

    await api().settings.patch({
      activeProvider: 'openai',
      backendMode: 'external',
      providerConfigs: { openai: { model: 'gpt-4o', url: 'https://api.openai.com/v1' } },
    });
    const withoutKey = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { chatId: chat.id, message: 'Привет.' },
    });

    expect(withoutKey.statusCode).toBe(409);
    expect(ChatReplyGenerationErrorResponseSchema.parse(withoutKey.json())).toMatchObject({
      code: 'generation_provider_unavailable',
      message: expect.stringContaining('API-ключ'),
    });

    await api().settings.patch({
      providerConfigs: { openai: { apiKey: 'sk-test', url: 'https://api.openai.com/v1' } },
    });
    const withoutModel = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply',
      payload: { chatId: chat.id, message: 'Ещё раз.' },
    });

    expect(withoutModel.statusCode).toBe(409);
    expect(ChatReplyGenerationErrorResponseSchema.parse(withoutModel.json())).toMatchObject({
      code: 'generation_provider_unavailable',
      message: expect.stringContaining('Модель'),
    });
    expect(api().http.requestLines()).toEqual([]);
  });

  it('returns 404 for a missing chat without calling the provider', async () => {
    answerWith('Should not be called.');
    const response = await api().app.inject({
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
    expect(api().http.requestLines()).toEqual([]);
  });
});
