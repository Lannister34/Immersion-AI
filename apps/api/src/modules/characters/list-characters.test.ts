import { describe, expect, it } from 'vitest';

import type { CharacterSummaryRecord } from './application/character-store.js';
import {
  type CharacterChatUsageRecord,
  listCharacters,
  resolveCharacterChatUsage,
} from './application/list-characters.js';

function usage(chatCount: number, lastChatAt: string | null): CharacterChatUsageRecord {
  return { chatCount, lastChatAt };
}

describe('resolveCharacterChatUsage', () => {
  it('reports zero usage for a character without chats', () => {
    expect(resolveCharacterChatUsage(new Map(), 'Лена.json')).toEqual({ chatCount: 0, lastChatAt: null });
  });

  it('sums chats bound before and after the move to JSON cards', () => {
    const stats = new Map([
      ['Лена.json', usage(2, '2026-07-01T10:00:00.000Z')],
      ['Лена.png', usage(3, '2026-07-20T10:00:00.000Z')],
    ]);

    expect(resolveCharacterChatUsage(stats, 'Лена.json')).toEqual({
      chatCount: 5,
      lastChatAt: '2026-07-20T10:00:00.000Z',
    });
  });

  it('keeps the usage of an unrelated character out of the count', () => {
    const stats = new Map([['Ember.png', usage(4, '2026-07-20T10:00:00.000Z')]]);

    expect(resolveCharacterChatUsage(stats, 'Лена.json')).toEqual({ chatCount: 0, lastChatAt: null });
  });
});

describe('listCharacters', () => {
  it('merges chat counts and last chat time into the list', async () => {
    const stored: CharacterSummaryRecord[] = [
      { avatarUrl: null, id: 'Лена.json', name: 'Лена', updatedAt: '2026-11-02T10:00:00.000Z' },
      {
        avatarUrl: '/api/characters/Ember.json/avatar?v=1',
        id: 'Ember.json',
        name: 'Ember',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ];
    const stats = new Map([['Лена.png', usage(3, '2026-11-03T10:00:00.000Z')]]);

    const response = await listCharacters({
      characterStore: { listCharacters: () => Promise.resolve(stored) },
      chatStats: { getCharacterChatStats: () => Promise.resolve(stats) },
    });

    expect(response.items).toEqual([
      { ...stored[0], chatCount: 3, lastChatAt: '2026-11-03T10:00:00.000Z' },
      { ...stored[1], chatCount: 0, lastChatAt: null },
    ]);
  });
});
