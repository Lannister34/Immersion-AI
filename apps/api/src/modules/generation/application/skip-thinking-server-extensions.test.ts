import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { type RecordedProviderRequest, stubProviderReply } from '../../../test-support/recording-provider-stub.js';
import { appendChatMessages } from '../../chats/application/append-chat-messages.js';
import { createChat } from '../../chats/application/create-chat.js';
import { generateCharacterAvatarPrompt } from './generate-character-avatar-prompt.js';
import { generateCharacterDraft } from './generate-character-draft.js';
import { generateCharacterField } from './generate-character-field.js';
import { generateChatTitle } from './generate-chat-title.js';
import { generateLorebookDraft } from './generate-lorebook-draft.js';
import { generateScenarioDraft } from './generate-scenario-draft.js';
import { generateScenarioFirstMessage } from './generate-scenario-first-message.js';

const LOCAL_PROVIDER_SETTINGS = {
  activeProvider: 'custom',
  backendMode: 'external',
  providerConfigs: { custom: { model: 'qwen3-8b', url: 'http://127.0.0.1:6006' } },
};

const CLOUD_PROVIDER_SETTINGS = {
  activeProvider: 'openai',
  backendMode: 'external',
  providerConfigs: { openai: { apiKey: 'test-key', model: 'gpt-4o', url: 'https://api.openai.com/v1' } },
};

const REPLY_EVERY_DRAFT_ACCEPTS = JSON.stringify({
  content: 'Мастерская гончара на окраине приморского города.',
  entries: [{ content: 'Глину везут из старого карьера за маяком.', keys: ['глина'] }],
  name: 'Ария Глинская',
  prompt: 'portrait of a potter, masterpiece, best quality',
});

const CONCEPT = 'Гончар из приморского города, который лепит амфоры для {{user}}';

const DRAFT_USE_CASES: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
  ['character draft', () => generateCharacterDraft({ concept: CONCEPT })],
  ['character field', () => generateCharacterField({ concept: CONCEPT, field: 'personality' })],
  ['character avatar prompt', () => generateCharacterAvatarPrompt({ card: { name: 'Ария Глинская' } })],
  ['scenario draft', () => generateScenarioDraft({ concept: CONCEPT })],
  ['scenario first message', () => generateScenarioFirstMessage({ concept: CONCEPT })],
  ['lorebook draft', () => generateLorebookDraft({ concept: CONCEPT })],
  ['chat title', generateTitleForSeededChat],
];

async function generateTitleForSeededChat(): Promise<unknown> {
  const { chat } = await createChat({ title: 'Чат о керамике' });
  await appendChatMessages(chat.id, [
    { content: 'Расскажи про обжиг керамики.', createdAt: '2026-01-01T00:00:00.000Z', role: 'user' },
    { content: 'Обжиг превращает глину в керамику.', createdAt: '2026-01-01T00:00:01.000Z', role: 'assistant' },
  ]);

  return generateChatTitle({ chatId: chat.id });
}

async function useProviderSettings(settings: object): Promise<void> {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-skip-thinking-'));
  await fs.writeFile(path.join(dataRoot, 'user-settings.json'), JSON.stringify(settings), 'utf8');
  vi.stubEnv('IMMERSION_DATA_ROOT', dataRoot);
  onTestFinished(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dataRoot, { force: true, recursive: true });
  });
}

function onlyRequestBody(requests: RecordedProviderRequest[]): Record<string, unknown> {
  expect(requests).toHaveLength(1);
  const body = requests[0]?.body;

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('The provider request carried no JSON object body.');
  }

  return body as Record<string, unknown>;
}

describe('llama-server counts reasoning tokens against max_tokens, so drafts ask the template to skip thinking', () => {
  it.each(DRAFT_USE_CASES)('the %s asks a local server to skip thinking', async (_name, generate) => {
    await useProviderSettings(LOCAL_PROVIDER_SETTINGS);
    const requests = stubProviderReply(REPLY_EVERY_DRAFT_ACCEPTS);

    await generate();

    expect(onlyRequestBody(requests)).toMatchObject({ chat_template_kwargs: { enable_thinking: false } });
  });

  it.each(DRAFT_USE_CASES)('the %s never sends chat_template_kwargs to the OpenAI cloud', async (_name, generate) => {
    await useProviderSettings(CLOUD_PROVIDER_SETTINGS);
    const requests = stubProviderReply(REPLY_EVERY_DRAFT_ACCEPTS);

    await generate();

    expect(onlyRequestBody(requests)).not.toHaveProperty('chat_template_kwargs');
  });
});
