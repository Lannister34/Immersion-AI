import { describe, expect, it } from 'vitest';

import { createManualClock } from '../../../test-support/manual-clock.js';
import type { ChatSummaryRecord, CreateGenericChatInput } from './chat-records.js';
import type { ChatRepository } from './chat-repository.js';
import type { ChatCharacterRecord, ChatScenarioRecord } from './chats-ports.js';
import { type CreateChatDependencies, createChat } from './create-chat.js';

const NOW = '2026-10-20T08:00:00.000Z';

const ARIA: ChatCharacterRecord = {
  description: 'Гончар из приморского города.',
  firstMessage: 'Здравствуй, {{user}}! Меня зовут {{char}}.',
  id: 'aria.json',
  name: 'Ария',
  personality: 'Спокойная.',
  scenario: 'Мастерская у моря.',
};

class RecordingChatRepository implements Pick<ChatRepository, 'createGenericChat'> {
  readonly created: CreateGenericChatInput[] = [];

  createGenericChat(input: CreateGenericChatInput): Promise<ChatSummaryRecord> {
    this.created.push(input);
    const lastSeed = input.seedMessages?.at(-1);

    return Promise.resolve({
      characterId: input.characterId ?? null,
      characterName: input.characterName ?? null,
      createdAt: input.createdAt,
      id: input.id,
      lastMessagePreview: lastSeed?.content ?? null,
      lorebookIds: input.lorebookIds ?? [],
      messageCount: input.seedMessages?.length ?? 0,
      scenarioId: input.scenarioId ?? null,
      scenarioName: input.scenarioName ?? null,
      title: input.title,
      updatedAt: lastSeed?.createdAt ?? input.createdAt,
    });
  }
}

function inMemoryDependencies(chatRepository: RecordingChatRepository): CreateChatDependencies {
  return {
    characters: {
      getCharacter: (characterId) =>
        characterId === ARIA.id ? Promise.resolve(ARIA) : Promise.reject(new Error(`No character ${characterId}`)),
    },
    chatRepository,
    clock: createManualClock({ start: new Date(NOW), stepMs: 0 }),
    profile: { getProfileUserName: () => 'Алексей' },
    scenarios: {
      getScenario: (scenarioId): Promise<ChatScenarioRecord> => Promise.reject(new Error(`No scenario ${scenarioId}`)),
    },
  };
}

describe('createChat', () => {
  it('takes the greeting from the bound character', async () => {
    const chatRepository = new RecordingChatRepository();

    const { chat } = await createChat({ characterId: ARIA.id }, inMemoryDependencies(chatRepository));

    expect(chatRepository.created[0]?.seedMessages).toEqual([
      { content: 'Здравствуй, Алексей! Меня зовут Ария.', createdAt: NOW, role: 'assistant' },
    ]);
    expect(chat).toMatchObject({
      characterId: ARIA.id,
      characterName: 'Ария',
      lastMessagePreview: 'Здравствуй, Алексей! Меня зовут Ария.',
      messageCount: 1,
      title: 'Чат с Ария',
    });
  });

  it('defaults the title', async () => {
    const chatRepository = new RecordingChatRepository();
    const dependencies = inMemoryDependencies(chatRepository);

    const untitled = await createChat({}, dependencies);
    const blank = await createChat({ title: '   ' }, dependencies);

    expect([untitled.chat.title, blank.chat.title]).toEqual(['Новый чат', 'Новый чат']);
    expect(chatRepository.created.map((input) => input.seedMessages)).toEqual([[], []]);
  });

  it('stamps createdAt and updatedAt from the injected clock', async () => {
    const chatRepository = new RecordingChatRepository();

    const { chat } = await createChat({ title: 'Сказка' }, inMemoryDependencies(chatRepository));

    expect(chatRepository.created[0]).toMatchObject({ createdAt: NOW, userName: 'Алексей' });
    expect(chat).toMatchObject({ createdAt: NOW, updatedAt: NOW });
  });
});
