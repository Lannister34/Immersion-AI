import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createHttpStub, type HttpStub } from '../../../test-support/http-stub.js';
import { InMemoryChatSessions } from '../../../test-support/in-memory-chat-sessions.js';
import {
  createInMemoryUserSettings,
  type InMemoryUserSettings,
} from '../../../test-support/in-memory-user-settings.js';
import { openAiChatCompletion } from '../../../test-support/provider-responses.js';
import { resolveChatGenerationSettings } from '../../prompting/index.js';
import { createProvidersModule } from '../../providers/index.js';
import { createSettingsModule, type UserSettingsRecord } from '../../settings/index.js';
import { createChatCompletionClient } from '../infrastructure/provider-clients/create-chat-completion-client.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import { generateCharacterAvatarPrompt } from './generate-character-avatar-prompt.js';
import { generateCharacterDraft } from './generate-character-draft.js';
import { generateCharacterField } from './generate-character-field.js';
import { generateChatTitle } from './generate-chat-title.js';
import { generateLorebookDraft } from './generate-lorebook-draft.js';
import { generateScenarioDraft } from './generate-scenario-draft.js';
import { generateScenarioFirstMessage } from './generate-scenario-first-message.js';
import type { DraftGenerationDependencies } from './generation-ports.js';

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

type DraftUseCase = (chatCompletionClient: ChatCompletionClient) => Promise<unknown>;

let storedProviderSettings: InMemoryUserSettings = createInMemoryUserSettings();

function onProviderSettings(chatCompletionClient: ChatCompletionClient): DraftGenerationDependencies {
  return {
    chatCompletionClient,
    providers: createProvidersModule({
      httpFetch: createHttpStub().fetch,
      runtimeEndpoint: { getRunningEndpoint: () => Promise.resolve(null) },
      settingsDocument: storedProviderSettings,
    }),
    settings: createSettingsModule({ userSettings: storedProviderSettings }),
  };
}

const DRAFT_USE_CASES: ReadonlyArray<readonly [string, DraftUseCase]> = [
  ['character draft', (client) => generateCharacterDraft({ concept: CONCEPT }, onProviderSettings(client))],
  [
    'character field',
    (client) =>
      generateCharacterField({ concept: CONCEPT, current: {}, field: 'personality' }, onProviderSettings(client)),
  ],
  [
    'character avatar prompt',
    (client) => generateCharacterAvatarPrompt({ card: { name: 'Ария Глинская' } }, onProviderSettings(client)),
  ],
  ['scenario draft', (client) => generateScenarioDraft({ concept: CONCEPT }, onProviderSettings(client))],
  [
    'scenario first message',
    (client) => generateScenarioFirstMessage({ concept: CONCEPT }, onProviderSettings(client)),
  ],
  [
    'lorebook draft',
    (client) => generateLorebookDraft({ concept: CONCEPT, entryCount: 8 }, onProviderSettings(client)),
  ],
  ['chat title', generateTitleForSeededChat],
];

async function generateTitleForSeededChat(chatCompletionClient: ChatCompletionClient): Promise<unknown> {
  const chats = new InMemoryChatSessions();
  chats.create('chat-ceramics', '2026-01-01T00:00:00.000Z');
  await chats.appendChatMessages('chat-ceramics', [
    { content: 'Расскажи про обжиг керамики.', createdAt: '2026-01-01T00:00:00.000Z', role: 'user' },
    { content: 'Обжиг превращает глину в керамику.', createdAt: '2026-01-01T00:00:01.000Z', role: 'assistant' },
  ]);

  return generateChatTitle(
    { chatId: 'chat-ceramics' },
    {
      ...onProviderSettings(chatCompletionClient),
      chats,
      prompting: { resolveChatGenerationSettings },
    },
  );
}

function useProviderSettings(settings: UserSettingsRecord): void {
  storedProviderSettings = createInMemoryUserSettings(settings);
}

const ProviderRequestBodySchema = z.record(z.string(), z.unknown());

function stubProviderReply(): HttpStub {
  const http = createHttpStub();
  http.on('POST', /\/chat\/completions$/u, () => openAiChatCompletion(REPLY_EVERY_DRAFT_ACCEPTS));

  return http;
}

function onlyRequestBody(http: HttpStub): Record<string, unknown> {
  expect(http.requests).toHaveLength(1);
  const body = http.requests[0]?.json(ProviderRequestBodySchema);

  if (body === undefined) {
    throw new Error('The provider received no request.');
  }

  return body;
}

describe('llama-server counts reasoning tokens against max_tokens, so drafts ask the template to skip thinking', () => {
  it.each(DRAFT_USE_CASES)('the %s asks a local server to skip thinking', async (_name, generate) => {
    useProviderSettings(LOCAL_PROVIDER_SETTINGS);
    const http = stubProviderReply();

    await generate(createChatCompletionClient({ httpFetch: http.fetch }));

    expect(onlyRequestBody(http)).toMatchObject({ chat_template_kwargs: { enable_thinking: false } });
  });

  it.each(DRAFT_USE_CASES)('the %s never sends chat_template_kwargs to the OpenAI cloud', async (_name, generate) => {
    useProviderSettings(CLOUD_PROVIDER_SETTINGS);
    const http = stubProviderReply();

    await generate(createChatCompletionClient({ httpFetch: http.fetch }));

    expect(onlyRequestBody(http)).not.toHaveProperty('chat_template_kwargs');
  });
});
