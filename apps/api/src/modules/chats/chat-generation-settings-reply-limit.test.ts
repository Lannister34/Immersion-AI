import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { type ChatSamplingOverridesDto, CreateChatResponseSchema } from '@immersion/contracts/chats';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../../app.js';
import { snapshotDataRoot } from '../../test-support/data-root-snapshot.js';

const userSettings = {
  activePresetId: 'obychnyy',
  samplerPresets: [
    {
      context_trim_strategy: 'trim_middle',
      id: 'obychnyy',
      max_context_length: 8192,
      max_length: 600,
      min_p: 0.02,
      name: 'Обычный',
      presence_penalty: 0,
      rep_pen: 1.05,
      rep_pen_range: 2048,
      temperature: 1,
      top_k: 0,
      top_p: 1,
    },
    {
      context_trim_strategy: 'trim_middle',
      id: 'slomannyy',
      max_context_length: 32_768,
      max_length: 32_768,
      min_p: 0.02,
      name: 'Сломанный',
      presence_penalty: 0,
      rep_pen: 1.05,
      rep_pen_range: 2048,
      temperature: 1,
      top_k: 0,
      top_p: 1,
    },
  ],
  userName: 'Тестер',
};

const noOverrides: ChatSamplingOverridesDto = {
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

function settingsCommand(samplerPresetId: string | null, sampling: Partial<ChatSamplingOverridesDto>) {
  return {
    additionalInstructions: 'Отвечай коротко.',
    samplerPresetId,
    sampling: { ...noOverrides, ...sampling },
    systemPrompt: null,
  };
}

describe('chat generation settings reply limit', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-reply-limit-'));
    await fs.writeFile(path.join(temporaryDataRoot, 'user-settings.json'), JSON.stringify(userSettings), 'utf8');
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

  async function createChat(app: ReturnType<typeof buildApiApp>) {
    const response = await app.inject({ method: 'POST', url: '/api/chats', payload: { title: 'Ночная гавань' } });

    return CreateChatResponseSchema.parse(response.json()).chat.id;
  }

  it('refuses overrides whose reply limit equals the context size and writes nothing', async () => {
    const app = buildApiApp();
    const chatId = await createChat(app);
    const before = await snapshotDataRoot(temporaryDataRoot);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload: settingsCommand(null, { maxContextLength: 32_768, maxTokens: 32_768 }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: 'reply_limit_exceeds_context',
      message:
        'Лимит ответа (32768) должен быть меньше размера контекста (32768): иначе в промпт попадает только последнее сообщение.',
    });
    expect(await snapshotDataRoot(temporaryDataRoot)).toEqual(before);

    await app.close();
  });

  it('refuses a reply limit override that reaches the context of the chat preset it is merged with', async () => {
    const app = buildApiApp();
    const chatId = await createChat(app);
    const before = await snapshotDataRoot(temporaryDataRoot);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload: settingsCommand('obychnyy', { maxTokens: 9000 }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'reply_limit_exceeds_context' });
    expect(await snapshotDataRoot(temporaryDataRoot)).toEqual(before);

    await app.close();
  });

  it('refuses a context override that shrinks below the reply limit of the chat preset', async () => {
    const app = buildApiApp();
    const chatId = await createChat(app);
    const before = await snapshotDataRoot(temporaryDataRoot);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload: settingsCommand('obychnyy', { maxContextLength: 600 }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'reply_limit_exceeds_context' });
    expect(await snapshotDataRoot(temporaryDataRoot)).toEqual(before);

    await app.close();
  });

  it('still saves other edits of a chat whose stored pair became impossible, but refuses changing the pair to another impossible one', async () => {
    const app = buildApiApp();
    const chatId = await createChat(app);
    const stored = settingsCommand('obychnyy', { maxTokens: 4000 });
    const storeResponse = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload: stored,
    });
    const presetResponse = await app.inject({
      method: 'PUT',
      url: '/api/settings/sampler/presets/obychnyy',
      payload: {
        contextTrimStrategy: 'trim_middle',
        maxContextLength: 4000,
        maxTokens: 600,
        minP: 0.02,
        name: 'Обычный',
        presencePenalty: 0,
        repeatPenalty: 1.05,
        repeatPenaltyRange: 2048,
        temperature: 1,
        topK: 0,
        topP: 1,
      },
    });

    expect(storeResponse.statusCode).toBe(200);
    expect(presetResponse.statusCode).toBe(200);

    const otherEditResponse = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload: { ...stored, additionalInstructions: 'Пиши от первого лица.', systemPrompt: 'Ты смотритель маяка.' },
    });

    expect(otherEditResponse.statusCode).toBe(200);

    const before = await snapshotDataRoot(temporaryDataRoot);
    const changedPairResponse = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload: settingsCommand('obychnyy', { maxTokens: 5000 }),
    });

    expect(changedPairResponse.statusCode).toBe(400);
    expect(changedPairResponse.json()).toMatchObject({ code: 'reply_limit_exceeds_context' });
    expect(await snapshotDataRoot(temporaryDataRoot)).toEqual(before);

    await app.close();
  });

  it('accepts an override that repairs a chat preset whose reply limit reaches its context', async () => {
    const app = buildApiApp();
    const chatId = await createChat(app);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload: settingsCommand('slomannyy', { maxTokens: 1024 }),
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it('accepts a chat without reply limit overrides even when its stored preset is impossible, so other edits still save', async () => {
    const app = buildApiApp();
    const chatId = await createChat(app);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload: settingsCommand('slomannyy', { temperature: 0.7 }),
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it('cannot check a lone override without a chat preset, because the preset is resolved only at generation time', async () => {
    const app = buildApiApp();
    const chatId = await createChat(app);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/chats/${chatId}/generation-settings`,
      payload: settingsCommand(null, { maxTokens: 9000 }),
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });
});
