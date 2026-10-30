import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';

import { FakeChatCompletionClient } from '../../../test-support/fake-chat-completion-client.js';
import type { ChatCompletionEndpoint } from './chat-completion-client.js';
import { generateLorebookDraft } from './generate-lorebook-draft.js';
import { ProviderGenerationError } from './generation-errors.js';
import type { DraftGenerationDependencies } from './generation-ports.js';

const CONFIGURED_ENDPOINT: ChatCompletionEndpoint = {
  apiKey: null,
  apiKind: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:6007',
  contextSize: null,
  model: 'настроенная-модель',
};

const SETTINGS: SettingsOverviewResponse = {
  profile: {
    messageFormatting: { actionsItalic: true, quotesHighlighted: false },
    responseLanguage: 'ru',
    streamingEnabled: true,
    systemPromptTemplate: '',
    thinkingEnabled: true,
    userName: 'Алексей',
    userPersona: '',
  },
  sampler: {
    activePresetId: 'active',
    modelBindingCount: 0,
    modelBindings: [],
    presets: [
      {
        contextTrimStrategy: 'trim_middle',
        id: 'active',
        maxContextLength: 8192,
        maxTokens: 600,
        minP: 0.02,
        name: 'Active',
        presencePenalty: 0,
        repeatPenalty: 1.05,
        repeatPenaltyRange: 2048,
        temperature: 0.65,
        topK: 0,
        topP: 1,
      },
    ],
  },
};

interface InMemoryPorts {
  readonly client: FakeChatCompletionClient;
  readonly dependencies: DraftGenerationDependencies;
}

function createInMemoryPorts(): InMemoryPorts {
  const client = new FakeChatCompletionClient();

  return {
    client,
    dependencies: {
      chatCompletionClient: client,
      providers: { resolveGenerationProviderEndpoint: () => Promise.resolve(CONFIGURED_ENDPOINT) },
      settings: { getSettingsOverview: () => SETTINGS },
    },
  };
}

function fenced(json: object): string {
  return `Вот лорбук:\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\nВ записях подставляй {{user}}.`;
}

function entry(index: number): object {
  return { comment: `Запись ${index}`, content: `Факт о мире номер ${index}.`, keys: [`ключ${index}`] };
}

describe('generateLorebookDraft', () => {
  it('parses entries from fenced model JSON', async () => {
    const { client, dependencies } = createInMemoryPorts();
    const controller = new AbortController();
    client.reply({
      content: fenced({
        entries: [
          { comment: 'Столица', content: 'Город на семи холмах.', keys: ['столица', 'город'] },
          { content: 'Глину везут из карьера за маяком.', key: 'глина' },
          { comment: 'Пустая', content: '   ', keys: ['пусто'] },
        ],
        name: 'Приморье',
      }),
    });

    const draft = await generateLorebookDraft({ concept: 'Приморский город гончаров', entryCount: 3 }, dependencies, {
      signal: controller.signal,
    });

    expect(draft).toEqual({
      entries: [
        { comment: 'Столица', content: 'Город на семи холмах.', keys: ['столица', 'город'] },
        { content: 'Глину везут из карьера за маяком.', keys: ['глина'] },
      ],
      name: 'Приморье',
    });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]).toMatchObject({
      endpoint: CONFIGURED_ENDPOINT,
      requireCompleteReply: true,
      sampling: { temperature: 0.65 },
    });
    expect(client.requests[0]?.signal).toBe(controller.signal);
  });

  it('caps the entry count at 20', async () => {
    const { client, dependencies } = createInMemoryPorts();
    client.reply({
      content: fenced({ entries: Array.from({ length: 25 }, (_, index) => entry(index + 1)), name: 'Большой мир' }),
    });

    const draft = await generateLorebookDraft({ concept: 'Огромный мир', entryCount: 20 }, dependencies);

    expect(draft.entries).toHaveLength(20);
    expect(draft.entries.at(-1)).toEqual(entry(20));
  });

  it('reports unusable model output as ProviderGenerationError', async () => {
    const { client, dependencies } = createInMemoryPorts();
    client
      .reply({ content: 'Извините, я не могу составить лорбук.' })
      .reply({ content: fenced({ entries: [{ content: '', keys: ['пусто'] }], name: 'Пустой мир' }) });

    await expect(generateLorebookDraft({ concept: 'Мир', entryCount: 3 }, dependencies)).rejects.toBeInstanceOf(
      ProviderGenerationError,
    );
    await expect(generateLorebookDraft({ concept: 'Мир', entryCount: 3 }, dependencies)).rejects.toThrow(
      new ProviderGenerationError('Provider returned a lorebook draft without usable entries. Try again.'),
    );
  });
});
