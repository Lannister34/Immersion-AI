import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type ChatSamplingOverridesDto,
  CreateChatResponseSchema,
  GetChatSessionResponseSchema,
} from '@immersion/contracts/chats';
import {
  ChatReplyPromptPreviewResponseSchema,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';
import {
  type CreateSamplerPresetCommand,
  SamplerPresetMutationResponseSchema,
  SettingsOverviewResponseSchema,
} from '@immersion/contracts/settings';
import { beforeEach, describe, expect, it } from 'vitest';

import { waitForGenerationJob } from './test-support/generation-jobs.js';
import { readProviderChatRequest } from './test-support/provider-chat-request.js';
import { openAiChatCompletion } from './test-support/provider-responses.js';
import { readStoredChatFile } from './test-support/stored-chat-file.js';
import { storedSamplerPreset } from './test-support/stored-sampler-preset.js';
import { useTestApi } from './test-support/use-test-api.js';

const PROVIDER_URL = 'http://127.0.0.1:6006';
const CHAT_COMPLETIONS_URL = `${PROVIDER_URL}/v1/chat/completions`;
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
const ARTEMIS: CreateSamplerPresetCommand = {
  contextTrimStrategy: 'trim_middle',
  maxContextLength: 32_256,
  maxTokens: 'unlimited',
  minP: 0.02,
  name: 'Artemis',
  presencePenalty: 0,
  repeatPenalty: 1.05,
  repeatPenaltyRange: 2048,
  temperature: 1,
  topK: 0,
  topP: 1,
};

describe('optional reply limit', () => {
  const api = useTestApi({ fixture: 'smoke' });

  beforeEach(async () => {
    await api().settings.useExternalProvider({ url: PROVIDER_URL });
  });

  async function useOnlyPreset(maxLength: unknown, maxContextLength = 32_256) {
    await api().settings.patch({
      activePresetId: 'artemis',
      modelPresetMap: {},
      samplerPresets: [
        storedSamplerPreset('artemis', 'Artemis', { max_context_length: maxContextLength, max_length: maxLength }),
      ],
    });
  }

  async function readPresets() {
    const response = await api().app.inject({ method: 'GET', url: '/api/settings/overview' });

    return SettingsOverviewResponseSchema.parse(response.json()).sampler.presets;
  }

  async function createChat() {
    const response = await api().app.inject({ method: 'POST', url: '/api/chats', payload: { title: 'Лимит ответа' } });

    return CreateChatResponseSchema.parse(response.json()).chat;
  }

  async function readSession(chatId: string) {
    const response = await api().app.inject({ method: 'GET', url: `/api/chats/${chatId}` });

    return GetChatSessionResponseSchema.parse(response.json());
  }

  async function sendMessage(chatId: string, message: string) {
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId, message },
    });

    return StartChatReplyGenerationJobResponseSchema.parse(response.json()).job;
  }

  describe('stored presets', () => {
    it.each([
      ['a positive integer', 32_225, 32_225],
      ['the unlimited token', 'unlimited', 'unlimited'],
      ['an absent value', undefined, 'unlimited'],
      ['0', 0, 'unlimited'],
      ['a negative number', -5, 'unlimited'],
      ['a fraction', 1.5, 'unlimited'],
      ['an unknown string', 'много', 'unlimited'],
    ])('reads a stored max_length that is %s leniently', async (_label, stored, expected) => {
      await useOnlyPreset(stored);

      expect(await readPresets()).toEqual([expect.objectContaining({ id: 'artemis', maxTokens: expected })]);
    });

    it('saves a preset without a reply limit at a context the form could not take before, and stores the unlimited token', async () => {
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/settings/sampler/presets',
        payload: ARTEMIS,
      });

      expect(response.statusCode).toBe(201);
      expect(SamplerPresetMutationResponseSchema.parse(response.json()).preset).toMatchObject({
        maxContextLength: 32_256,
        maxTokens: 'unlimited',
      });
      expect(await api().settings.samplerPreset('artemis')).toMatchObject({ max_length: 'unlimited' });
    });

    it('repairs the stored Artemis 32225/32256 preset into one without a reply limit', async () => {
      await useOnlyPreset(32_225);

      const response = await api().app.inject({
        method: 'PUT',
        url: '/api/settings/sampler/presets/artemis',
        payload: ARTEMIS,
      });

      expect(response.statusCode).toBe(200);
      expect(await api().settings.samplerPreset('artemis')).toMatchObject({ max_length: 'unlimited' });
    });

    it.each([0, -1, 1.5, 'none', null])('refuses a reply limit of %s with 400 validation_error', async (maxTokens) => {
      const response = await api().app.inject({
        method: 'POST',
        url: '/api/settings/sampler/presets',
        payload: { ...ARTEMIS, maxTokens },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'validation_error' });
    });
  });

  describe('chat overrides', () => {
    it('stores a chat override without a reply limit apart from inheriting the preset limit', async () => {
      await useOnlyPreset(2048);
      const chat = await createChat();

      const response = await api().app.inject({
        method: 'PUT',
        url: `/api/chats/${chat.id}/generation-settings`,
        payload: {
          additionalInstructions: null,
          samplerPresetId: null,
          sampling: { ...NO_SAMPLING_OVERRIDES, maxTokens: 'unlimited' },
          systemPrompt: null,
        },
      });

      expect(response.statusCode).toBe(200);
      expect((await readSession(chat.id)).generationSettings.sampling.maxTokens).toBe('unlimited');
    });

    it('reads a stored chat override of max_length 0 as inheriting the preset instead of failing the chat', async () => {
      const chatsDirectory = path.join(api().dataRoot, 'chats', '_no_character_');
      await fs.mkdir(chatsDirectory, { recursive: true });
      await fs.writeFile(
        path.join(chatsDirectory, 'legacy-zero.jsonl'),
        `${[
          JSON.stringify({
            chat_metadata: {
              createdAt: '2026-01-01T00:00:00.000Z',
              title: 'Старый',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
            generation_settings: { sampling: { max_length: 0 } },
            user_name: 'Тестер',
          }),
          JSON.stringify({ is_user: true, mes: 'Привет.', send_date: '2026-01-01T00:00:00.000Z' }),
        ].join('\n')}\n`,
        'utf8',
      );

      const session = await readSession('legacy-zero');

      expect(session.generationSettings.sampling.maxTokens).toBeNull();
      expect(session.messages[0]?.stoppedAtTokenLimit).toBe(false);
    });
  });

  it('keeps a stored extra of a foreign shape when a message is edited', async () => {
    const chatsDirectory = path.join(api().dataRoot, 'chats', '_no_character_');
    await fs.mkdir(chatsDirectory, { recursive: true });
    const filePath = path.join(chatsDirectory, 'foreign-extra.jsonl');
    await fs.writeFile(
      filePath,
      `${[
        JSON.stringify({
          chat_metadata: {
            createdAt: '2026-01-01T00:00:00.000Z',
            title: 'Чужой',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          user_name: 'Тестер',
        }),
        JSON.stringify({ extra: 'legacy', is_user: false, mes: 'Старое.', send_date: '2026-01-01T00:00:00.000Z' }),
      ].join('\n')}\n`,
      'utf8',
    );

    const response = await api().app.inject({
      method: 'PATCH',
      url: '/api/chats/foreign-extra/messages/1',
      payload: { content: 'Новое.' },
    });

    expect(response.statusCode).toBe(200);
    expect((await readStoredChatFile(filePath)).messages[0]).toMatchObject({ extra: 'legacy', mes: 'Новое.' });
  });

  describe('generation', () => {
    it('sends no max_tokens and the whole history when the preset has no reply limit', async () => {
      await useOnlyPreset('unlimited');
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('Ответ без лимита.'));
      const chat = await createChat();

      await waitForGenerationJob(api(), (await sendMessage(chat.id, 'Первое сообщение.')).id, 'completed');
      await waitForGenerationJob(api(), (await sendMessage(chat.id, 'Второе сообщение.')).id, 'completed');

      const body = readProviderChatRequest(api().http, 1);
      expect(body).not.toHaveProperty('max_tokens');
      expect(body.messages.map((message) => message.content)).toEqual([
        'Первое сообщение.',
        'Ответ без лимита.',
        'Второе сообщение.',
      ]);
    });

    it('marks a reply cut at the token limit in the chat and keeps the mark in the stored file', async () => {
      await useOnlyPreset('unlimited');
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('Оборвалось на полусл', 'length'));
      const chat = await createChat();

      await waitForGenerationJob(api(), (await sendMessage(chat.id, 'Расскажи длинную историю.')).id, 'completed');

      const session = await readSession(chat.id);
      expect(session.messages.map((message) => message.stoppedAtTokenLimit)).toEqual([false, true]);
      const stored = await readStoredChatFile(path.join(api().dataRoot, 'chats', '_no_character_', `${chat.id}.jsonl`));
      expect(stored.messages[1]).toMatchObject({ extra: { stopped_at_token_limit: true } });
    });

    it('clears the mark when the user edits the cut reply by hand', async () => {
      await useOnlyPreset('unlimited');
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('Оборвалось на полусл', 'length'));
      const chat = await createChat();
      await waitForGenerationJob(api(), (await sendMessage(chat.id, 'Расскажи.')).id, 'completed');

      const response = await api().app.inject({
        method: 'PATCH',
        url: `/api/chats/${chat.id}/messages/2`,
        payload: { content: 'Оборвалось на полуслове — дописал сам.' },
      });

      expect(response.statusCode).toBe(200);
      expect((await readSession(chat.id)).messages.at(-1)?.stoppedAtTokenLimit).toBe(false);
    });

    it('clears the mark once a continuation of the cut reply ends on its own', async () => {
      await useOnlyPreset('unlimited');
      api().http.once('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('Оборвалось на полусл', 'length'));
      api().http.once('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('ове.'));
      const chat = await createChat();
      await waitForGenerationJob(api(), (await sendMessage(chat.id, 'Расскажи.')).id, 'completed');

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-jobs',
        payload: { chatId: chat.id, mode: 'continue' },
      });
      const job = StartChatReplyGenerationJobResponseSchema.parse(response.json()).job;
      await waitForGenerationJob(api(), job.id, 'completed');

      const lastMessage = (await readSession(chat.id)).messages.at(-1);
      expect(lastMessage?.stoppedAtTokenLimit).toBe(false);
      expect(lastMessage?.content).toContain('ове.');
    });

    async function overrideChat(chatId: string, sampling: ChatSamplingOverridesDto, systemPrompt: string | null) {
      const response = await api().app.inject({
        method: 'PUT',
        url: `/api/chats/${chatId}/generation-settings`,
        payload: { additionalInstructions: null, samplerPresetId: null, sampling, systemPrompt },
      });

      expect(response.statusCode).toBe(200);
    }

    function providerCalls() {
      return api()
        .http.requestLines()
        .filter((line) => line === `POST ${CHAT_COMPLETIONS_URL}`);
    }

    it('refuses a message whose explicit reply limit leaves no room for history, naming the numbers, before storing it or calling the provider', async () => {
      await useOnlyPreset(32_225);
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('Не должно прийти.'));
      const chat = await createChat();
      await overrideChat(chat.id, NO_SAMPLING_OVERRIDES, 'Ты — Артемида, охотница. '.repeat(20));

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-jobs',
        payload: { chatId: chat.id, message: 'Привет.' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'prompt_exceeds_context' });
      expect(response.json<{ message: string }>().message).toContain('32256');
      expect(response.json<{ message: string }>().message).toContain('32225');
      expect((await readSession(chat.id)).messages).toEqual([]);
      expect(providerCalls()).toEqual([]);
    });

    it('keeps the reply when a regeneration would be refused, which the save check lets through for a chat override without its own preset', async () => {
      await useOnlyPreset(2048, 4096);
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('Не должно прийти.'));
      const chat = await createChat();
      await api().modules.chats.appendChatMessages(chat.id, [
        { content: 'Привет.', createdAt: '2026-01-01T00:00:00.000Z', role: 'user' },
        { content: 'Здравствуй.', createdAt: '2026-01-01T00:00:01.000Z', role: 'assistant' },
      ]);
      await overrideChat(chat.id, { ...NO_SAMPLING_OVERRIDES, maxTokens: 4096 }, null);

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-jobs/regenerate',
        payload: { chatId: chat.id },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'prompt_exceeds_context' });
      expect(response.json<{ message: string }>().message).toContain('4096');
      expect((await readSession(chat.id)).messages.map((message) => message.content)).toEqual([
        'Привет.',
        'Здравствуй.',
      ]);
      expect(providerCalls()).toEqual([]);
    });

    it('fails a continuation job that cannot fit with prompt_exceeds_context and never calls the provider', async () => {
      await useOnlyPreset(2048, 4096);
      api().http.on('POST', CHAT_COMPLETIONS_URL, () => openAiChatCompletion('Не должно прийти.'));
      const chat = await createChat();
      await api().modules.chats.appendChatMessages(chat.id, [
        { content: 'Привет.', createdAt: '2026-01-01T00:00:00.000Z', role: 'user' },
        { content: 'Здравствуй.', createdAt: '2026-01-01T00:00:01.000Z', role: 'assistant' },
      ]);
      await overrideChat(chat.id, { ...NO_SAMPLING_OVERRIDES, maxTokens: 4096 }, null);

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-jobs',
        payload: { chatId: chat.id, mode: 'continue' },
      });
      const job = StartChatReplyGenerationJobResponseSchema.parse(response.json()).job;
      const failed = await waitForGenerationJob(api(), job.id, 'failed');

      expect(failed.error).toMatchObject({ code: 'prompt_exceeds_context' });
      expect((await readSession(chat.id)).messages.at(-1)?.content).toBe('Здравствуй.');
      expect(providerCalls()).toEqual([]);
    });

    it('previews a request without max_tokens and the unlimited reply setting', async () => {
      await useOnlyPreset('unlimited');
      const chat = await createChat();

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-preview',
        payload: { chatId: chat.id, draftUserMessage: 'Привет.' },
      });
      const preview = ChatReplyPromptPreviewResponseSchema.parse(response.json());

      expect(preview.request.maxTokens).toBeNull();
      expect(preview.effectiveSettings.sampling.maxTokens).toBe('unlimited');
      expect(preview.diagnostics.budgetStatus).toBe('fits');
    });
  });
});
