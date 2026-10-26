import type { ChatMessageDto, ChatSessionDto } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import { type LoadChatPromptContextDependencies, loadChatPromptContext } from './load-chat-prompt-context.js';
import type { PromptCharacterRecord, PromptLorebookRecord, PromptScenarioRecord } from './prompting-ports.js';

interface PromptLibrary {
  readonly characters?: Readonly<Record<string, PromptCharacterRecord>>;
  readonly lorebooks?: Readonly<Record<string, PromptLorebookRecord>>;
  readonly scenarios?: Readonly<Record<string, PromptScenarioRecord>>;
}

interface SessionLinks {
  readonly characterId?: string;
  readonly lorebookIds?: string[];
  readonly messages?: ChatMessageDto[];
  readonly scenarioId?: string;
}

const ARIA: PromptCharacterRecord = {
  description: 'Молодая скульпторша.',
  exampleDialogue: '',
  name: 'Ария',
  personality: 'Тихая.',
  scenario: 'Вечер в мастерской.',
  systemPrompt: '',
};

const PICNIC: PromptScenarioRecord = {
  concept: 'Летний день.',
  content: 'Пикник у реки.',
  name: 'Пикник',
};

function inMemoryReaders(library: PromptLibrary): LoadChatPromptContextDependencies {
  return {
    characters: { findCharacter: (id) => Promise.resolve(library.characters?.[id] ?? null) },
    lorebooks: { findLorebook: (id) => Promise.resolve(library.lorebooks?.[id] ?? null) },
    scenarios: { findScenario: (id) => Promise.resolve(library.scenarios?.[id] ?? null) },
  };
}

function userMessage(index: number, content: string): ChatMessageDto {
  return {
    attachments: [],
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
    id: `message-${index}`,
    reasoning: null,
    role: 'user',
  };
}

function buildSession(links: SessionLinks): ChatSessionDto {
  const characterId = links.characterId ?? null;
  const scenarioId = links.scenarioId ?? null;
  const lorebookIds = links.lorebookIds ?? [];
  const messages = links.messages ?? [];

  return {
    characterAvatarUrl: null,
    characterId,
    characterName: null,
    scenarioId,
    scenarioName: null,
    lorebookIds,
    chat: {
      characterAvatarUrl: null,
      characterId,
      characterName: null,
      scenarioId,
      scenarioName: null,
      lorebookIds,
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'chat-1',
      lastMessagePreview: null,
      messageCount: messages.length,
      title: 'Context test',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    generationSettings: {
      additionalInstructions: null,
      samplerPresetId: null,
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
      systemPrompt: null,
    },
    messages,
    userName: 'Tester',
  };
}

describe('loadChatPromptContext', () => {
  it('prefers the linked scenario over the scenario on the character card', async () => {
    const readers = inMemoryReaders({ characters: { 'Aria.json': ARIA }, scenarios: { 'Пикник.json': PICNIC } });

    const context = await loadChatPromptContext(
      buildSession({ characterId: 'Aria.json', scenarioId: 'Пикник.json' }),
      readers,
    );

    expect(context.character?.name).toBe('Ария');
    expect(context.characterScenarioContent).toBe('Пикник у реки.');
  });

  it('activates a lorebook entry whose key appears in the lookback window', async () => {
    const readers = inMemoryReaders({
      lorebooks: {
        'Мир.json': {
          entries: [
            { content: 'Старый дракон спит под горой.', enabled: true, keys: ['Дракон'], priority: 1 },
            { content: 'Маяк погас сто лет назад.', enabled: true, keys: ['маяк'], priority: 5 },
          ],
          name: 'Мир',
        },
      },
    });
    const messages = [
      userMessage(0, 'Расскажи про маяк.'),
      ...Array.from({ length: 15 }, (_, index) => userMessage(index + 1, 'Идём дальше.')),
      userMessage(16, 'А что там с ДРАКОНОМ?'),
    ];

    const context = await loadChatPromptContext(buildSession({ lorebookIds: ['Мир.json'], messages }), readers);

    expect(context.lorebookSections).toEqual(['Lorebook «Мир»:\n- (Дракон): Старый дракон спит под горой.']);
  });

  it('ignores a bound lorebook that no longer exists', async () => {
    const readers = inMemoryReaders({
      lorebooks: {
        'Мир.json': {
          entries: [{ content: 'Маяк погас сто лет назад.', enabled: true, keys: ['маяк'], priority: 1 }],
          name: 'Мир',
        },
      },
    });

    const context = await loadChatPromptContext(
      buildSession({ lorebookIds: ['Удалённый.json', 'Мир.json'], messages: [userMessage(0, 'Где маяк?')] }),
      readers,
    );

    expect(context.lorebookSections).toEqual(['Lorebook «Мир»:\n- (маяк): Маяк погас сто лет назад.']);
  });

  it('builds a scenario-only context', async () => {
    const readers = inMemoryReaders({ scenarios: { 'Пикник.json': PICNIC } });

    const context = await loadChatPromptContext(buildSession({ scenarioId: 'Пикник.json' }), readers);

    expect(context).toEqual({
      character: {
        description: 'Летний день.',
        mesExample: null,
        name: 'Пикник',
        personality: null,
        systemPrompt: null,
      },
      characterScenarioContent: 'Пикник у реки.',
      lorebookSections: [],
    });
  });
});
