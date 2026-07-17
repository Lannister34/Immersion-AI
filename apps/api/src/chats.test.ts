import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  BranchChatResponseSchema,
  ChatListResponseSchema,
  ChatMessageMutationResponseSchema,
  CreateChatResponseSchema,
  GetChatSessionResponseSchema,
  ImportChatResponseSchema,
  UpdateChatGenerationSettingsResponseSchema,
  UpdateChatTitleResponseSchema,
} from '@immersion/contracts/chats';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

const testSettings = {
  textgenerationwebui: {
    server_urls: {
      koboldcpp: 'http://127.0.0.1:5001',
    },
  },
};

const testUserSettings = {
  activePresetId: 'default',
  modelPresetMap: {
    'smoke-model': 'smoke-model-preset',
  },
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
    {
      context_trim_strategy: 'trim_start',
      id: 'smoke-model-preset',
      max_context_length: 12288,
      max_length: 777,
      min_p: 0.04,
      name: 'Smoke Model',
      presence_penalty: 0.2,
      rep_pen: 1.11,
      rep_pen_range: 512,
      temperature: 0.44,
      top_k: 7,
      top_p: 0.82,
    },
  ],
  systemPromptTemplate: 'Reply as {{char}} and do not speak for {{user}}.',
  userName: '\u0422\u0435\u0441\u0442\u0435\u0440',
  userPersona: 'Rewrite tester.',
};

describe('chat routes', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-chats-'));
    await fs.writeFile(path.join(temporaryDataRoot, 'settings.json'), JSON.stringify(testSettings), 'utf8');
    await fs.writeFile(path.join(temporaryDataRoot, 'user-settings.json'), JSON.stringify(testUserSettings), 'utf8');
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
  });

  afterEach(async () => {
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }

    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  async function writeGenericChatFile(chatId: string, lines: string[]) {
    const chatsDirectory = path.join(temporaryDataRoot, 'chats', '_no_character_');
    await fs.mkdir(chatsDirectory, { recursive: true });
    await fs.writeFile(path.join(chatsDirectory, `${chatId}.jsonl`), `${lines.join('\n')}\n`, 'utf8');
  }

  it('creates a generic chat and exposes it through list and session routes', async () => {
    const app = buildApiApp();
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: {
        title: 'Проверка MVP',
      },
    });
    const createPayload = CreateChatResponseSchema.parse(createResponse.json());

    expect(createResponse.statusCode).toBe(201);
    expect(createPayload.chat.title).toBe('Проверка MVP');
    expect(createPayload.chat.messageCount).toBe(0);

    const filePath = path.join(temporaryDataRoot, 'chats', '_no_character_', `${createPayload.chat.id}.jsonl`);
    await expect(fs.access(filePath)).resolves.toBeUndefined();
    const headerLine = (await fs.readFile(filePath, 'utf8')).split(/\r?\n/u)[0] ?? '';
    expect(headerLine).not.toBe('');
    const headerPayload = JSON.parse(headerLine) as {
      chat_metadata: {
        createdAt: string;
        title: string;
        updatedAt: string;
      };
      character_name: string;
      generation_settings: unknown;
      user_name: string;
    };

    expect(headerPayload).toMatchObject({
      chat_metadata: {
        title: 'Проверка MVP',
        createdAt: createPayload.chat.createdAt,
        updatedAt: createPayload.chat.updatedAt,
      },
      character_name: '',
      generation_settings: {
        sampler_preset_id: null,
        system_prompt: null,
      },
      user_name: '\u0422\u0435\u0441\u0442\u0435\u0440',
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/chats',
    });
    const listPayload = ChatListResponseSchema.parse(listResponse.json());

    expect(listResponse.statusCode).toBe(200);
    expect(listPayload.items).toHaveLength(1);
    expect(listPayload.items[0]).toMatchObject({
      id: createPayload.chat.id,
      title: 'Проверка MVP',
      messageCount: 0,
      lastMessagePreview: null,
      characterName: null,
    });

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${createPayload.chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionPayload.chat.id).toBe(createPayload.chat.id);
    expect(sessionPayload.userName).toBe('\u0422\u0435\u0441\u0442\u0435\u0440');
    expect(sessionPayload.generationSettings).toMatchObject({
      samplerPresetId: null,
      systemPrompt: null,
    });
    expect(sessionPayload.messages).toEqual([]);

    await app.close();
  });

  it('updates and persists chat-owned generation settings', async () => {
    const app = buildApiApp();
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: {
        title: 'Generation settings',
      },
    });
    const createPayload = CreateChatResponseSchema.parse(createResponse.json());
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/chats/${createPayload.chat.id}/generation-settings`,
      payload: {
        samplerPresetId: 'smoke-model-preset',
        systemPrompt: 'You are concise. Reply to {{user}}.',
        sampling: {
          contextTrimStrategy: 'trim_start',
          maxContextLength: 4096,
          maxTokens: 321,
          minP: 0.05,
          presencePenalty: 0.25,
          repeatPenalty: 1.12,
          repeatPenaltyRange: 256,
          temperature: 0.33,
          topK: 12,
          topP: 0.77,
        },
      },
    });
    const updatePayload = UpdateChatGenerationSettingsResponseSchema.parse(updateResponse.json());

    expect(updateResponse.statusCode).toBe(200);
    expect(updatePayload.generationSettings).toEqual({
      samplerPresetId: 'smoke-model-preset',
      systemPrompt: 'You are concise. Reply to {{user}}.',
      sampling: {
        contextTrimStrategy: 'trim_start',
        maxContextLength: 4096,
        maxTokens: 321,
        minP: 0.05,
        presencePenalty: 0.25,
        repeatPenalty: 1.12,
        repeatPenaltyRange: 256,
        temperature: 0.33,
        topK: 12,
        topP: 0.77,
      },
    });

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${createPayload.chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(sessionPayload.generationSettings).toEqual(updatePayload.generationSettings);

    const filePath = path.join(temporaryDataRoot, 'chats', '_no_character_', `${createPayload.chat.id}.jsonl`);
    const headerLine = (await fs.readFile(filePath, 'utf8')).split(/\r?\n/u)[0] ?? '';
    const headerPayload = JSON.parse(headerLine) as Record<string, unknown>;

    expect(headerPayload.generation_settings).toMatchObject({
      sampler_preset_id: 'smoke-model-preset',
      system_prompt: 'You are concise. Reply to {{user}}.',
      sampling: {
        context_trim_strategy: 'trim_start',
        max_context_length: 4096,
        max_length: 321,
        min_p: 0.05,
        presence_penalty: 0.25,
        rep_pen: 1.12,
        rep_pen_range: 256,
        temperature: 0.33,
        top_k: 12,
        top_p: 0.77,
      },
    });

    await app.close();
  });

  it('returns 400 for invalid chat generation settings', async () => {
    const app = buildApiApp();
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: {
        title: 'Invalid generation settings',
      },
    });
    const createPayload = CreateChatResponseSchema.parse(createResponse.json());
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/chats/${createPayload.chat.id}/generation-settings`,
      payload: {
        samplerPresetId: null,
        systemPrompt: null,
        sampling: {
          contextTrimStrategy: null,
          maxContextLength: 0,
          maxTokens: null,
          minP: null,
          presencePenalty: null,
          repeatPenalty: null,
          repeatPenaltyRange: null,
          temperature: null,
          topK: null,
          topP: null,
        },
      },
    });

    expect(updateResponse.statusCode).toBe(400);
    expect(updateResponse.json()).toMatchObject({
      code: 'validation_error',
    });

    await app.close();
  });

  it('returns 400 when chat generation settings reference an unknown sampler preset', async () => {
    const app = buildApiApp();
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: {
        title: 'Unknown preset',
      },
    });
    const createPayload = CreateChatResponseSchema.parse(createResponse.json());
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/chats/${createPayload.chat.id}/generation-settings`,
      payload: {
        samplerPresetId: 'missing-preset',
        systemPrompt: null,
        sampling: {
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
        },
      },
    });

    expect(updateResponse.statusCode).toBe(400);
    expect(updateResponse.json()).toMatchObject({
      code: 'invalid_chat_generation_settings',
    });

    await app.close();
  });

  it('does not mutate persisted chat generation settings when update references an unknown preset', async () => {
    const app = buildApiApp();
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: {
        title: 'Preserve valid generation settings',
      },
    });
    const createPayload = CreateChatResponseSchema.parse(createResponse.json());
    const validPayload = {
      samplerPresetId: 'smoke-model-preset',
      systemPrompt: 'Keep this prompt.',
      sampling: {
        contextTrimStrategy: 'trim_start',
        maxContextLength: 4096,
        maxTokens: 321,
        minP: 0.05,
        presencePenalty: 0.25,
        repeatPenalty: 1.12,
        repeatPenaltyRange: 256,
        temperature: 0.33,
        topK: 12,
        topP: 0.77,
      },
    };
    const validUpdateResponse = await app.inject({
      method: 'PUT',
      url: `/api/chats/${createPayload.chat.id}/generation-settings`,
      payload: validPayload,
    });

    expect(validUpdateResponse.statusCode).toBe(200);

    const invalidUpdateResponse = await app.inject({
      method: 'PUT',
      url: `/api/chats/${createPayload.chat.id}/generation-settings`,
      payload: {
        ...validPayload,
        samplerPresetId: 'missing-preset',
        systemPrompt: 'Do not persist this prompt.',
      },
    });

    expect(invalidUpdateResponse.statusCode).toBe(400);
    expect(invalidUpdateResponse.json()).toMatchObject({
      code: 'invalid_chat_generation_settings',
    });

    const sessionResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${createPayload.chat.id}`,
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(sessionPayload.generationSettings).toEqual(validPayload);

    await app.close();
  });

  it('parses existing legacy generic chat files and sorts summaries by latest activity', async () => {
    await writeGenericChatFile('older-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Старый чат',
          updatedAt: '2026-01-01T00:01:00.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({
        is_user: false,
        mes: 'Старый ответ',
        send_date: '2026-01-01T00:01:00.000Z',
      }),
    ]);
    await writeGenericChatFile('legacy-session', [
      JSON.stringify({
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({
        is_user: true,
        mes: 'Первое сообщение',
        send_date: '2026-01-02T00:00:00.000Z',
      }),
      JSON.stringify({
        is_user: false,
        mes: 'Системная заметка',
        send_date: '2026-01-02T00:01:00.000Z',
        extra: {
          type: 'system',
        },
      }),
      JSON.stringify({
        is_user: false,
        mes: 'Ответ модели',
        send_date: '2026-01-02T00:02:00.000Z',
      }),
    ]);

    const app = buildApiApp();
    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/chats',
    });
    const listPayload = ChatListResponseSchema.parse(listResponse.json());

    expect(listResponse.statusCode).toBe(200);
    expect(listPayload.items.map((item) => item.id)).toEqual(['legacy-session', 'older-chat']);
    expect(listPayload.items[0]).toMatchObject({
      title: 'Первое сообщение',
      lastMessagePreview: 'Ответ модели',
      messageCount: 3,
      updatedAt: '2026-01-02T00:02:00.000Z',
      characterName: null,
    });

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/chats/legacy-session',
    });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionPayload.messages.map((message) => message.role)).toEqual(['user', 'system', 'assistant']);
    expect(sessionPayload.messages.map((message) => message.content)).toEqual([
      'Первое сообщение',
      'Системная заметка',
      'Ответ модели',
    ]);
    expect(sessionPayload.chat.title).toBe('Первое сообщение');
    expect(sessionPayload.generationSettings).toMatchObject({
      samplerPresetId: null,
      systemPrompt: null,
    });

    await app.close();
  });

  it('fails fast when a canonical chat file is malformed', async () => {
    await writeGenericChatFile('broken-session', [
      JSON.stringify({
        user_name: 'Тестер',
        character_name: '',
      }),
      'not-json',
    ]);

    const app = buildApiApp();
    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/chats',
    });
    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/chats/broken-session',
    });

    expect(listResponse.statusCode).toBe(500);
    expect(listResponse.json()).toMatchObject({
      code: 'internal_error',
    });
    expect(sessionResponse.statusCode).toBe(500);
    expect(sessionResponse.json()).toMatchObject({
      code: 'internal_error',
    });

    await app.close();
  });

  it('creates a chat bound to a character and seeds its first message', async () => {
    const charactersDir = path.join(temporaryDataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.writeFile(
      path.join(charactersDir, 'Aria.json'),
      JSON.stringify({
        name: 'Ария',
        description: 'Скульптор',
        first_message: 'Привет, ты в студии впервые?',
      }),
      'utf8',
    );

    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { characterId: 'Aria.json' },
    });
    const payload = CreateChatResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(201);
    expect(payload.chat.characterId).toBe('Aria.json');
    expect(payload.chat.characterName).toBe('Ария');
    expect(payload.chat.title).toBe('Чат с Ария');
    expect(payload.chat.characterAvatarUrl).toBeNull();
    expect(payload.chat.messageCount).toBe(1);

    const sessionResponse = await app.inject({ method: 'GET', url: `/api/chats/${payload.chat.id}` });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());
    expect(sessionPayload.characterId).toBe('Aria.json');
    expect(sessionPayload.characterName).toBe('Ария');
    expect(sessionPayload.messages).toHaveLength(1);
    expect(sessionPayload.messages[0]).toMatchObject({
      role: 'assistant',
      content: 'Привет, ты в студии впервые?',
    });

    await app.close();
  });

  it('does not seed the card greeting when a separate scenario is bound', async () => {
    const charactersDir = path.join(temporaryDataRoot, 'characters');
    const scenariosDir = path.join(temporaryDataRoot, 'scenarios');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.mkdir(scenariosDir, { recursive: true });
    await fs.writeFile(
      path.join(charactersDir, 'Aria.json'),
      JSON.stringify({
        name: 'Ария',
        description: 'Скульптор',
        first_message: 'Привет, ты в студии впервые?',
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(scenariosDir, 'Пикник.json'),
      JSON.stringify({
        name: 'Пикник',
        concept: 'Встреча в парке',
        content: '{{user}} и {{char}} встречаются в парке.',
      }),
      'utf8',
    );

    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { characterId: 'Aria.json', scenarioId: 'Пикник.json' },
    });
    const payload = CreateChatResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(201);
    // Приветствие карточки написано под её базовый сценарий — при другом сценарии не вставляется.
    expect(payload.chat.messageCount).toBe(0);

    await app.close();
  });

  it('exposes a PNG character avatar URL on the chat summary', async () => {
    const charactersDir = path.join(temporaryDataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.writeFile(path.join(charactersDir, 'Arina.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { characterId: 'Arina.png', title: 'Чат с Ариной' },
    });
    const payload = CreateChatResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(201);
    expect(payload.chat.characterId).toBe('Arina.png');
    expect(payload.chat.characterAvatarUrl).toBe('/api/characters/Arina.png/avatar');
    expect(payload.chat.title).toBe('Чат с Ариной');
    expect(payload.chat.messageCount).toBe(0);

    await app.close();
  });

  it('returns 404 when creating a chat with an unknown characterId', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { characterId: 'no-such-character' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'character_not_found' });

    await app.close();
  });

  it('returns 400 for an invalid create command', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: {
        title: '',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'validation_error',
    });

    await app.close();
  });

  it('returns 400 for an invalid chat id', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/chats/invalid.chat.id',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'validation_error',
    });

    await app.close();
  });

  it('returns 404 for an unknown chat id', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/chats/missing-chat',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'chat_not_found',
    });

    await app.close();
  });

  it('patches a single message content and returns the refreshed session', async () => {
    await writeGenericChatFile('edit-route-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Edit route',
          updatedAt: '2026-01-01T00:00:03.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'one', send_date: '2026-01-01T00:00:01.000Z' }),
      JSON.stringify({ is_user: false, mes: 'two', send_date: '2026-01-01T00:00:02.000Z' }),
      JSON.stringify({ is_user: true, mes: 'three', send_date: '2026-01-01T00:00:03.000Z' }),
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/chats/edit-route-chat/messages/2',
      payload: { content: 'two-edited' },
    });
    const payload = ChatMessageMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.session.messages.map((message) => message.content)).toEqual(['one', 'two-edited', 'three']);
    expect(payload.session.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);

    await app.close();
  });

  it('rejects empty content when patching a message', async () => {
    await writeGenericChatFile('edit-empty-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Empty edit',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'kept', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/chats/edit-empty-chat/messages/1',
      payload: { content: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });

    await app.close();
  });

  it('returns 404 when patching a non-existent message index', async () => {
    await writeGenericChatFile('edit-missing-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Missing edit',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'only', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/chats/edit-missing-chat/messages/9',
      payload: { content: 'oops' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_message_not_found' });

    await app.close();
  });

  it('switches the chat character via PATCH /bindings and reflects it in the next session read', async () => {
    const charactersDir = path.join(temporaryDataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.writeFile(
      path.join(charactersDir, 'Arina.json'),
      JSON.stringify({ name: 'Arina', description: 'first', updatedAt: '2026-01-01T00:00:00.000Z' }),
    );
    await fs.writeFile(
      path.join(charactersDir, 'Boris.json'),
      JSON.stringify({ name: 'Boris', description: 'second', updatedAt: '2026-01-01T00:00:00.000Z' }),
    );

    await writeGenericChatFile('bindings-route-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Chat about Arina',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        character_id: 'Arina.json',
        character_name: 'Arina',
        user_name: 'Тестер',
      }),
      JSON.stringify({ is_user: true, mes: 'hi Arina', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const bindResponse = await app.inject({
      method: 'PATCH',
      url: '/api/chats/bindings-route-chat/bindings',
      payload: { characterId: 'Boris.json' },
    });
    const bindPayload = GetChatSessionResponseSchema.parse(bindResponse.json());

    expect(bindResponse.statusCode).toBe(200);
    expect(bindPayload.characterId).toBe('Boris.json');
    expect(bindPayload.characterName).toBe('Boris');
    expect(bindPayload.chat.characterId).toBe('Boris.json');

    const readResponse = await app.inject({ method: 'GET', url: '/api/chats/bindings-route-chat' });
    const readPayload = GetChatSessionResponseSchema.parse(readResponse.json());
    expect(readPayload.characterId).toBe('Boris.json');

    // Clear the character by passing null.
    const clearResponse = await app.inject({
      method: 'PATCH',
      url: '/api/chats/bindings-route-chat/bindings',
      payload: { characterId: null },
    });
    const clearPayload = GetChatSessionResponseSchema.parse(clearResponse.json());
    expect(clearResponse.statusCode).toBe(200);
    expect(clearPayload.characterId).toBeNull();
    expect(clearPayload.characterName).toBeNull();

    await app.close();
  });

  it('PATCH /bindings returns 404 when the new character does not exist', async () => {
    await writeGenericChatFile('bindings-missing-char-chat', [
      JSON.stringify({
        chat_metadata: { createdAt: '2026-01-01T00:00:00.000Z', title: 'x', updatedAt: '2026-01-01T00:00:01.000Z' },
        user_name: 'Тестер',
      }),
      JSON.stringify({ is_user: true, mes: 'hi', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/chats/bindings-missing-char-chat/bindings',
      payload: { characterId: 'never-existed.png' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'character_not_found' });

    await app.close();
  });

  it('renames a chat via PATCH /title and surfaces the new title in subsequent reads', async () => {
    await writeGenericChatFile('rename-route-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Old title',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'hi', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const renameResponse = await app.inject({
      method: 'PATCH',
      url: '/api/chats/rename-route-chat/title',
      payload: { title: '  New title  ' },
    });
    const renamePayload = UpdateChatTitleResponseSchema.parse(renameResponse.json());

    expect(renameResponse.statusCode).toBe(200);
    expect(renamePayload.chat.title).toBe('New title');

    const sessionResponse = await app.inject({ method: 'GET', url: '/api/chats/rename-route-chat' });
    const sessionPayload = GetChatSessionResponseSchema.parse(sessionResponse.json());
    expect(sessionPayload.chat.title).toBe('New title');

    const listResponse = await app.inject({ method: 'GET', url: '/api/chats' });
    const listPayload = ChatListResponseSchema.parse(listResponse.json());
    expect(listPayload.items.find((item) => item.id === 'rename-route-chat')?.title).toBe('New title');

    await app.close();
  });

  it('rejects renaming a chat with an empty title', async () => {
    await writeGenericChatFile('rename-empty-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Stays',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'hi', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/chats/rename-empty-chat/title',
      payload: { title: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });

    await app.close();
  });

  it('returns 404 when renaming a missing chat', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/chats/never-was-chat/title',
      payload: { title: 'New' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_not_found' });

    await app.close();
  });

  it('truncates messages from the chosen index via DELETE', async () => {
    await writeGenericChatFile('truncate-route-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Truncate route',
          updatedAt: '2026-01-01T00:00:04.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'keep-1', send_date: '2026-01-01T00:00:01.000Z' }),
      JSON.stringify({ is_user: false, mes: 'keep-2', send_date: '2026-01-01T00:00:02.000Z' }),
      JSON.stringify({ is_user: true, mes: 'drop-1', send_date: '2026-01-01T00:00:03.000Z' }),
      JSON.stringify({ is_user: false, mes: 'drop-2', send_date: '2026-01-01T00:00:04.000Z' }),
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/chats/truncate-route-chat/messages/3',
    });
    const payload = ChatMessageMutationResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload.session.messages.map((message) => message.content)).toEqual(['keep-1', 'keep-2']);
    expect(payload.session.chat.messageCount).toBe(2);

    await app.close();
  });

  it('returns 404 when truncating with an out-of-range index', async () => {
    await writeGenericChatFile('truncate-missing-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Truncate missing',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'only', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/chats/truncate-missing-chat/messages/9',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_message_not_found' });

    await app.close();
  });

  it('branches a chat from the chosen message and returns the new summary', async () => {
    await writeGenericChatFile('branch-source-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Branch source',
          updatedAt: '2026-01-01T00:00:04.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'shared-1', send_date: '2026-01-01T00:00:01.000Z' }),
      JSON.stringify({ is_user: false, mes: 'shared-2', send_date: '2026-01-01T00:00:02.000Z' }),
      JSON.stringify({ is_user: true, mes: 'shared-3', send_date: '2026-01-01T00:00:03.000Z' }),
      JSON.stringify({ is_user: false, mes: 'tail', send_date: '2026-01-01T00:00:04.000Z' }),
    ]);

    const app = buildApiApp();
    const branchResponse = await app.inject({
      method: 'POST',
      url: '/api/chats/branch-source-chat/branch',
      payload: { throughMessageIndex: 3 },
    });
    const branchPayload = BranchChatResponseSchema.parse(branchResponse.json());

    expect(branchResponse.statusCode).toBe(201);
    expect(branchPayload.chat.title).toBe('Branch source (ветка)');
    expect(branchPayload.chat.id).not.toBe('branch-source-chat');
    expect(branchPayload.chat.messageCount).toBe(3);

    const sourceResponse = await app.inject({
      method: 'GET',
      url: '/api/chats/branch-source-chat',
    });
    const sourcePayload = GetChatSessionResponseSchema.parse(sourceResponse.json());
    expect(sourcePayload.messages.map((message) => message.content)).toEqual([
      'shared-1',
      'shared-2',
      'shared-3',
      'tail',
    ]);
    expect(sourcePayload.chat.title).toBe('Branch source');

    const forkResponse = await app.inject({
      method: 'GET',
      url: `/api/chats/${branchPayload.chat.id}`,
    });
    const forkPayload = GetChatSessionResponseSchema.parse(forkResponse.json());
    expect(forkPayload.messages.map((message) => message.content)).toEqual(['shared-1', 'shared-2', 'shared-3']);
    expect(forkPayload.userName).toBe('Тестер');

    await app.close();
  });

  it('honours a custom title when branching', async () => {
    await writeGenericChatFile('branch-titled-source', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Original',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'one', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const branchResponse = await app.inject({
      method: 'POST',
      url: '/api/chats/branch-titled-source/branch',
      payload: { throughMessageIndex: 1, title: 'Альтернативный путь' },
    });
    const branchPayload = BranchChatResponseSchema.parse(branchResponse.json());

    expect(branchResponse.statusCode).toBe(201);
    expect(branchPayload.chat.title).toBe('Альтернативный путь');

    await app.close();
  });

  it('returns 404 when branching from a missing chat', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats/never-existed/branch',
      payload: { throughMessageIndex: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_not_found' });

    await app.close();
  });

  it('returns 404 when branching with an out-of-range index', async () => {
    await writeGenericChatFile('branch-range-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Range',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'only', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats/branch-range-chat/branch',
      payload: { throughMessageIndex: 99 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_message_not_found' });

    await app.close();
  });

  it('deletes a chat and removes it from the list', async () => {
    await writeGenericChatFile('delete-route-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Delete route',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'bye', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/api/chats/delete-route-chat',
    });

    expect(deleteResponse.statusCode).toBe(204);
    expect(deleteResponse.body).toBe('');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/chats/delete-route-chat',
    });
    expect(sessionResponse.statusCode).toBe(404);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/chats',
    });
    const listPayload = ChatListResponseSchema.parse(listResponse.json());
    expect(listPayload.items.find((item) => item.id === 'delete-route-chat')).toBeUndefined();

    await app.close();
  });

  it('exports a chat as JSONL with an attachment header derived from the title', async () => {
    await writeGenericChatFile('export-route-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Сказка о драконе',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        user_name: 'Тестер',
        character_name: '',
      }),
      JSON.stringify({ is_user: true, mes: 'one', send_date: '2026-01-01T00:00:01.000Z' }),
    ]);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/chats/export-route-chat/export',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('filename*=UTF-8');
    expect(response.body.trim().split('\n')).toHaveLength(2);
    expect(response.body).toContain('chat_metadata');
    expect(response.body).toContain('"mes":"one"');

    await app.close();
  });

  it('returns 404 when exporting a missing chat', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/chats/never-existed/export',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_not_found' });

    await app.close();
  });

  it('returns 404 when deleting a missing chat', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/chats/never-existed',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'chat_not_found' });

    await app.close();
  });

  it('returns 404 when updating generation settings for an unknown chat', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/chats/missing-chat/generation-settings',
      payload: {
        samplerPresetId: null,
        systemPrompt: null,
        sampling: {
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
        },
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'chat_not_found',
    });

    await app.close();
  });

  it('round-trips a chat through export and import', async () => {
    await writeGenericChatFile('roundtrip-chat', [
      JSON.stringify({
        chat_metadata: {
          createdAt: '2026-01-01T00:00:00.000Z',
          title: 'Экспорт туда и обратно',
          updatedAt: '2026-01-01T00:00:03.000Z',
        },
        user_name: 'Экспортёр',
        character_name: 'Дракон',
      }),
      JSON.stringify({ is_user: true, mes: 'Привет!', send_date: '2026-01-01T00:00:01.000Z' }),
      JSON.stringify({ is_user: false, mes: 'Здравствуй, путник.', send_date: '2026-01-01T00:00:02.000Z' }),
      JSON.stringify({
        extra: { type: 'system' },
        is_user: false,
        mes: 'Сцена меняется.',
        send_date: '2026-01-01T00:00:03.000Z',
      }),
    ]);

    const app = buildApiApp();
    const exportResponse = await app.inject({
      method: 'GET',
      url: '/api/chats/roundtrip-chat/export',
    });
    expect(exportResponse.statusCode).toBe(200);

    const importResponse = await app.inject({
      method: 'POST',
      url: '/api/chats/import',
      payload: {
        contentBase64: Buffer.from(exportResponse.body, 'utf8').toString('base64'),
      },
    });
    expect(importResponse.statusCode).toBe(201);
    const importPayload = ImportChatResponseSchema.parse(importResponse.json());

    expect(importPayload.importedMessages).toBe(3);
    expect(importPayload.skippedLines).toBe(0);
    expect(importPayload.chat.id).not.toBe('roundtrip-chat');
    expect(importPayload.chat.title).toBe('Экспорт туда и обратно');
    expect(importPayload.chat.characterName).toBe('Дракон');
    // Идентификаторы не привязываются автоматически: имя остаётся только подписью.
    expect(importPayload.chat.characterId).toBeNull();

    const sourceSession = GetChatSessionResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/chats/roundtrip-chat' })).json(),
    );
    const importedSession = GetChatSessionResponseSchema.parse(
      (await app.inject({ method: 'GET', url: `/api/chats/${importPayload.chat.id}` })).json(),
    );

    expect(importedSession.userName).toBe('Экспортёр');
    expect(importedSession.messages.map(({ role, content, createdAt }) => ({ role, content, createdAt }))).toEqual(
      sourceSession.messages.map(({ role, content, createdAt }) => ({ role, content, createdAt })),
    );

    await app.close();
  });

  it('imports a messages-only file without a header', async () => {
    const content = [
      JSON.stringify({ is_user: true, mes: 'Только сообщения', send_date: '2026-02-01T00:00:00.000Z' }),
      '',
      JSON.stringify({ is_user: false, mes: 'Без заголовка', send_date: '2026-02-01T00:00:01.000Z' }),
    ].join('\n');

    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats/import',
      payload: {
        contentBase64: Buffer.from(content, 'utf8').toString('base64'),
        title: 'Импорт без заголовка',
      },
    });

    expect(response.statusCode).toBe(201);
    const payload = ImportChatResponseSchema.parse(response.json());
    expect(payload.importedMessages).toBe(2);
    expect(payload.skippedLines).toBe(0);
    expect(payload.chat.title).toBe('Импорт без заголовка');
    expect(payload.chat.messageCount).toBe(2);

    const session = GetChatSessionResponseSchema.parse(
      (await app.inject({ method: 'GET', url: `/api/chats/${payload.chat.id}` })).json(),
    );
    expect(session.messages.map((message) => message.content)).toEqual(['Только сообщения', 'Без заголовка']);
    expect(session.messages.map((message) => message.role)).toEqual(['user', 'assistant']);

    await app.close();
  });

  it('rejects an import file without a single valid message', async () => {
    const content = ['это не JSON', '[1, 2, 3]', '"строка"', ''].join('\n');

    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats/import',
      payload: {
        contentBase64: Buffer.from(content, 'utf8').toString('base64'),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_chat_file' });

    await app.close();
  });

  it('rejects an oversized import file', async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);

    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats/import',
      payload: {
        contentBase64: oversized.toString('base64'),
      },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: 'chat_file_too_large' });

    await app.close();
  });
});
