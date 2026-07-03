import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { CreateChatResponseSchema, GetChatSessionResponseSchema } from '@immersion/contracts/chats';
import { GenerateChatTitleResponseSchema, GenerateFirstMessageResponseSchema } from '@immersion/contracts/generation';
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
  stream?: boolean;
  temperature?: number;
}

interface SmokeUserSettingsFixture {
  activeProvider?: string;
  backendMode?: string;
  providerConfigs?: Record<string, Record<string, string>>;
}

describe('generation utility routes', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-generation-utilities-'));
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

  async function createChat(app: ReturnType<typeof buildApiApp>, payload: object = { title: 'Utility chat' }) {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload,
    });

    expect(createResponse.statusCode).toBe(201);

    return CreateChatResponseSchema.parse(createResponse.json()).chat;
  }

  async function seedChatMessages(chatId: string) {
    await appendChatMessages(chatId, [
      {
        role: 'user',
        content: 'Расскажи про обжиг керамики.',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        role: 'assistant',
        content: 'Обжиг превращает глину в керамику при высокой температуре.',
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ]);
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

  async function writeBuiltinProviderSettings() {
    const settingsPath = path.join(temporaryDataRoot, 'user-settings.json');
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as SmokeUserSettingsFixture;

    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          ...settings,
          backendMode: 'builtin',
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  function getProviderRequestBody(request: ProviderRequestRecord | undefined): ProviderRequestBodyRecord {
    if (!request?.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      throw new Error('Provider request body was not recorded.');
    }

    return request.body as ProviderRequestBodyRecord;
  }

  async function getSession(app: ReturnType<typeof buildApiApp>, chatId: string) {
    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${chatId}`,
    });

    expect(sessionResponse.statusCode).toBe(200);

    return GetChatSessionResponseSchema.parse(sessionResponse.json());
  }

  describe('POST /api/generation/chat-title', () => {
    it('generates a sanitized title from the transcript and persists it through the chats module', async () => {
      const providerRequests = mockProviderSuccess('\n«Обжиг керамики в студии».\n');
      const app = buildApiApp();
      const chat = await createChat(app);
      await seedChatMessages(chat.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });
      const payload = GenerateChatTitleResponseSchema.parse(response.json());

      expect(response.statusCode).toBe(200);
      expect(payload.title).toBe('Обжиг керамики в студии');
      expect(payload.chat).toMatchObject({
        id: chat.id,
        title: 'Обжиг керамики в студии',
      });

      const session = await getSession(app, chat.id);
      expect(session.chat.title).toBe('Обжиг керамики в студии');

      expect(providerRequests).toHaveLength(1);
      expect(providerRequests[0]).toMatchObject({
        authorization: 'Bearer secret-token',
        url: 'http://127.0.0.1:6006/v1/chat/completions',
      });
      const requestBody = getProviderRequestBody(providerRequests[0]);
      expect(requestBody).toMatchObject({
        max_tokens: 48,
        stream: false,
        temperature: 0.3,
      });
      const submittedContent = requestBody.messages?.map((message) => message.content).join('\n') ?? '';
      expect(submittedContent).toContain('Расскажи про обжиг керамики.');
      expect(submittedContent).toContain('same language as the conversation');

      await app.close();
    });

    it('returns 409 chat_empty for a chat without messages and does not call the provider', async () => {
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();
      const chat = await createChat(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'chat_empty' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });

    it('returns 404 for a missing chat', async () => {
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: 'missing-chat',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'chat_not_found' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });

    it('returns 502 and keeps the current title when the provider fails', async () => {
      const providerRequests = mockProviderFailure();
      const app = buildApiApp();
      const chat = await createChat(app, { title: 'Original title' });
      await seedChatMessages(chat.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
      expect(providerRequests).toHaveLength(1);

      const session = await getSession(app, chat.id);
      expect(session.chat.title).toBe('Original title');

      await app.close();
    });

    it('returns 502 when the provider reply sanitizes down to an empty title', async () => {
      mockProviderSuccess('«»...');
      const app = buildApiApp();
      const chat = await createChat(app, { title: 'Original title' });
      await seedChatMessages(chat.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });

      const session = await getSession(app, chat.id);
      expect(session.chat.title).toBe('Original title');

      await app.close();
    });

    it('returns 409 chat_title_conflict and keeps the manual title when the chat is renamed mid-generation', async () => {
      const app = buildApiApp();
      const chat = await createChat(app, { title: 'Original title' });
      await seedChatMessages(chat.id);

      // Провайдер «медленный»: пока он отвечает, пользователь переименовывает чат вручную.
      globalThis.fetch = vi.fn(async () => {
        const renameResponse = await app.inject({
          method: 'PATCH',
          url: `/api/chats/${chat.id}/title`,
          payload: { title: 'Ручное название' },
        });
        expect(renameResponse.statusCode).toBe(200);

        return new Response(JSON.stringify({ choices: [{ message: { content: 'Сгенерированное название' } }] }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }) as typeof fetch;

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'chat_title_conflict' });

      const session = await getSession(app, chat.id);
      expect(session.chat.title).toBe('Ручное название');

      await app.close();
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await writeBuiltinProviderSettings();
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();
      const chat = await createChat(app);
      await seedChatMessages(chat.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });
  });

  describe('POST /api/generation/first-message', () => {
    it('generates and appends the character opening message for an empty character chat', async () => {
      const charactersDir = path.join(temporaryDataRoot, 'characters');
      await fs.mkdir(charactersDir, { recursive: true });
      await fs.writeFile(
        path.join(charactersDir, 'Aria.json'),
        JSON.stringify({
          name: 'Ария',
          description: 'Молодая скульпторша из Петербурга.',
          personality: 'Тихая, но острая на язык.',
          scenario: 'В мастерской вечером, в стенах пахнет глиной.',
        }),
        'utf8',
      );
      const providerRequests = mockProviderSuccess('Привет! Ты впервые в моей мастерской?');
      const app = buildApiApp();
      const chat = await createChat(app, { characterId: 'Aria.json' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: chat.id,
        },
      });
      const payload = GenerateFirstMessageResponseSchema.parse(response.json());

      expect(response.statusCode).toBe(200);
      expect(payload.session.messages).toHaveLength(1);
      expect(payload.session.messages[0]).toMatchObject({
        role: 'assistant',
        content: 'Привет! Ты впервые в моей мастерской?',
      });

      const session = await getSession(app, chat.id);
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toMatchObject({
        role: 'assistant',
        content: 'Привет! Ты впервые в моей мастерской?',
      });

      expect(providerRequests).toHaveLength(1);
      const requestBody = getProviderRequestBody(providerRequests[0]);
      // smoke-model is bound to smoke-model-preset (max_length 777) in the fixture.
      expect(requestBody).toMatchObject({
        max_tokens: 777,
        stream: false,
      });
      const systemMessage = requestBody.messages?.find((message) => message.role === 'system');
      expect(systemMessage?.content).toContain('Ария');
      expect(systemMessage?.content).toContain('Молодая скульпторша из Петербурга.');
      const lastMessage = requestBody.messages?.at(-1);
      expect(lastMessage?.role).toBe('user');
      expect(lastMessage?.content).toContain('opening message');
      // Fixture profile responseLanguage is 'ru'.
      expect(lastMessage?.content).toContain('Write it in Russian.');

      await app.close();
    });

    it('generates a generic opener for an empty free chat without character bindings', async () => {
      const providerRequests = mockProviderSuccess('Привет! О чём поговорим сегодня?');
      const app = buildApiApp();
      const chat = await createChat(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: chat.id,
        },
      });
      const payload = GenerateFirstMessageResponseSchema.parse(response.json());

      expect(response.statusCode).toBe(200);
      expect(payload.session.messages).toHaveLength(1);
      expect(payload.session.messages[0]).toMatchObject({
        role: 'assistant',
        content: 'Привет! О чём поговорим сегодня?',
      });

      expect(providerRequests).toHaveLength(1);
      const requestBody = getProviderRequestBody(providerRequests[0]);
      expect(requestBody.messages?.filter((message) => message.role === 'system')).toEqual([]);
      const lastMessage = requestBody.messages?.at(-1);
      expect(lastMessage?.role).toBe('user');
      expect(lastMessage?.content).toContain('Start the conversation');

      await app.close();
    });

    it('returns 409 chat_not_empty for a chat that already has messages', async () => {
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();
      const chat = await createChat(app);
      await seedChatMessages(chat.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'chat_not_empty' });
      expect(providerRequests).toHaveLength(0);

      const session = await getSession(app, chat.id);
      expect(session.messages).toHaveLength(2);

      await app.close();
    });

    it('returns 404 for a missing chat', async () => {
      const providerRequests = mockProviderSuccess('Should not be called.');
      const app = buildApiApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: 'missing-chat',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'chat_not_found' });
      expect(providerRequests).toHaveLength(0);

      await app.close();
    });

    it('returns 409 chat_not_empty and appends nothing when a message lands mid-generation', async () => {
      const app = buildApiApp();
      const chat = await createChat(app);

      // Пока провайдер отвечает, в чат успевает попасть сообщение пользователя.
      globalThis.fetch = vi.fn(async () => {
        await appendChatMessages(chat.id, [
          {
            role: 'user',
            content: 'Я успел написать первым.',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]);

        return new Response(JSON.stringify({ choices: [{ message: { content: 'Сгенерированный опенер.' } }] }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }) as typeof fetch;

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'chat_not_empty' });

      const session = await getSession(app, chat.id);
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toMatchObject({
        role: 'user',
        content: 'Я успел написать первым.',
      });

      await app.close();
    });

    it('returns 502 and appends nothing when the provider fails', async () => {
      const providerRequests = mockProviderFailure();
      const app = buildApiApp();
      const chat = await createChat(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
      expect(providerRequests).toHaveLength(1);

      const session = await getSession(app, chat.id);
      expect(session.messages).toEqual([]);

      await app.close();
    });
  });
});
