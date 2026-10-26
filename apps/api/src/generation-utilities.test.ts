import fs from 'node:fs/promises';
import path from 'node:path';

import { CreateChatResponseSchema, GetChatSessionResponseSchema } from '@immersion/contracts/chats';
import { GenerateChatTitleResponseSchema, GenerateFirstMessageResponseSchema } from '@immersion/contracts/generation';
import { beforeEach, describe, expect, it } from 'vitest';

import { appendChatMessages } from './modules/chats/index.js';
import { openSocketRequest } from './test-support/open-socket-request.js';
import { readProviderChatRequest } from './test-support/provider-chat-request.js';
import { openAiChatCompletion, providerFailure } from './test-support/provider-responses.js';
import { useTestApi } from './test-support/use-test-api.js';

const PROVIDER_URL = 'http://127.0.0.1:6006';
const CHAT_COMPLETIONS_URL = `${PROVIDER_URL}/v1/chat/completions`;

describe('generation utility routes', () => {
  const api = useTestApi({ fixture: 'smoke' });

  beforeEach(async () => {
    await api().settings.useExternalProvider({ url: PROVIDER_URL });
  });

  function answerWith(content: string) {
    api().http.on('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion(content));
  }

  async function createChat(payload: object = { title: 'Utility chat' }) {
    const createResponse = await api().app.inject({
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

  async function getSession(chatId: string) {
    const sessionResponse = await api().app.inject({
      method: 'GET',
      url: `/api/chats/${chatId}`,
    });

    expect(sessionResponse.statusCode).toBe(200);

    return GetChatSessionResponseSchema.parse(sessionResponse.json());
  }

  describe('POST /api/generation/chat-title', () => {
    it('generates a sanitized title from the transcript and persists it through the chats module', async () => {
      answerWith('\n«Обжиг керамики в студии».\n');
      const chat = await createChat();
      await seedChatMessages(chat.id);

      const response = await api().app.inject({
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

      const session = await getSession(chat.id);
      expect(session.chat.title).toBe('Обжиг керамики в студии');

      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
      expect(api().http.requests[0]?.headers.get('authorization')).toBe('Bearer secret-token');
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody).toMatchObject({
        max_tokens: 48,
        stream: false,
        temperature: 0.3,
      });
      const submittedContent = requestBody.messages.map((message) => message.content).join('\n');
      expect(submittedContent).toContain('Расскажи про обжиг керамики.');
      expect(submittedContent).toContain('same language as the conversation');
    });

    it('returns 409 chat_empty for a chat without messages and does not call the provider', async () => {
      answerWith('Should not be called.');
      const chat = await createChat();

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'chat_empty' });
      expect(api().http.requestLines()).toEqual([]);
    });

    it('returns 404 for a missing chat', async () => {
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: 'missing-chat',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'chat_not_found' });
      expect(api().http.requestLines()).toEqual([]);
    });

    it('returns 502 and keeps the current title when the provider fails', async () => {
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => providerFailure());
      const chat = await createChat({ title: 'Original title' });
      await seedChatMessages(chat.id);

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);

      const session = await getSession(chat.id);
      expect(session.chat.title).toBe('Original title');
    });

    it('returns 502 when the provider reply sanitizes down to an empty title', async () => {
      answerWith('«»...');
      const chat = await createChat({ title: 'Original title' });
      await seedChatMessages(chat.id);

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });

      const session = await getSession(chat.id);
      expect(session.chat.title).toBe('Original title');
    });

    it('returns 409 chat_title_conflict and keeps the manual title when the chat is renamed mid-generation', async () => {
      const chat = await createChat({ title: 'Original title' });
      await seedChatMessages(chat.id);
      let renameStatus: number | null = null;

      api().http.on('POST', CHAT_COMPLETIONS_URL, async () => {
        const renameResponse = await api().app.inject({
          method: 'PATCH',
          url: `/api/chats/${chat.id}/title`,
          payload: { title: 'Ручное название' },
        });
        renameStatus = renameResponse.statusCode;

        return openAiChatCompletion('Сгенерированное название');
      });

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(renameStatus).toBe(200);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'chat_title_conflict' });

      const session = await getSession(chat.id);
      expect(session.chat.title).toBe('Ручное название');
    });

    it('returns 409 generation_provider_unavailable when no provider endpoint can be resolved', async () => {
      await api().settings.patch({ backendMode: 'builtin' });
      answerWith('Should not be called.');
      const chat = await createChat();
      await seedChatMessages(chat.id);

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-title',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(api().http.requestLines()).toEqual([]);
    });
  });

  describe('POST /api/generation/first-message', () => {
    it('generates and appends the character opening message for an empty character chat with the model-bound preset in the profile language', async () => {
      const charactersDir = path.join(api().dataRoot, 'characters');
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
      answerWith('Привет! Ты впервые в моей мастерской?');
      const modelBoundPreset = await api().settings.samplerPreset('smoke-model-preset');
      const chat = await createChat({ characterId: 'Aria.json' });

      const response = await api().app.inject({
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

      const session = await getSession(chat.id);
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toMatchObject({
        role: 'assistant',
        content: 'Привет! Ты впервые в моей мастерской?',
      });

      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody).toMatchObject({
        max_tokens: modelBoundPreset.max_length,
        stream: false,
      });
      const systemMessage = requestBody.messages.find((message) => message.role === 'system');
      expect(systemMessage?.content).toContain('Ария');
      expect(systemMessage?.content).toContain('Молодая скульпторша из Петербурга.');
      const lastMessage = requestBody.messages.at(-1);
      expect(lastMessage?.role).toBe('user');
      expect(lastMessage?.content).toContain('opening message');
      expect(lastMessage?.content).toContain('Write it in Russian.');
    });

    it('generates a generic opener for an empty free chat without character bindings', async () => {
      answerWith('Привет! О чём поговорим сегодня?');
      const chat = await createChat();

      const response = await api().app.inject({
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

      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);
      const requestBody = readProviderChatRequest(api().http);
      expect(requestBody.messages.filter((message) => message.role === 'system')).toEqual([]);
      const lastMessage = requestBody.messages.at(-1);
      expect(lastMessage?.role).toBe('user');
      expect(lastMessage?.content).toContain('Start the conversation');
    });

    it('returns 409 chat_not_empty for a chat that already has messages', async () => {
      answerWith('Should not be called.');
      const chat = await createChat();
      await seedChatMessages(chat.id);

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'chat_not_empty' });
      expect(api().http.requestLines()).toEqual([]);

      const session = await getSession(chat.id);
      expect(session.messages).toHaveLength(2);
    });

    it('returns 404 for a missing chat', async () => {
      answerWith('Should not be called.');
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: 'missing-chat',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'chat_not_found' });
      expect(api().http.requestLines()).toEqual([]);
    });

    it('returns 409 chat_not_empty and appends nothing when a message lands mid-generation', async () => {
      const chat = await createChat();

      api().http.on('POST', CHAT_COMPLETIONS_URL, async () => {
        await appendChatMessages(chat.id, [
          {
            role: 'user',
            content: 'Я успел написать первым.',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]);

        return openAiChatCompletion('Сгенерированный опенер.');
      });

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'chat_not_empty' });

      const session = await getSession(chat.id);
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toMatchObject({
        role: 'user',
        content: 'Я успел написать первым.',
      });
    });

    it('returns 502 and appends nothing when the provider fails', async () => {
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => providerFailure());
      const chat = await createChat();

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/first-message',
        payload: {
          chatId: chat.id,
        },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'provider_generation_failed' });
      expect(api().http.requestLines()).toEqual([`POST ${CHAT_COMPLETIONS_URL}`]);

      const session = await getSession(chat.id);
      expect(session.messages).toEqual([]);
    });
  });

  describe('a client that disconnects mid-generation', () => {
    async function expectDisconnectToAbortTheProviderCall(url: string, chatId: string) {
      const provider = api().http.hold('POST', CHAT_COMPLETIONS_URL);
      const client = openSocketRequest(`${await api().listen()}${url}`, { chatId });
      const providerRequest = await provider.started;

      expect(providerRequest.signal?.aborted).toBe(false);

      await client.disconnect();
      await provider.aborted;

      expect(providerRequest.signal?.aborted).toBe(true);
    }

    it('aborts the provider call of a chat title', async () => {
      const chat = await createChat();
      await seedChatMessages(chat.id);

      await expectDisconnectToAbortTheProviderCall('/api/generation/chat-title', chat.id);
    });

    it('aborts the provider call of a first message', async () => {
      const chat = await createChat();

      await expectDisconnectToAbortTheProviderCall('/api/generation/first-message', chat.id);
    });
  });
});
