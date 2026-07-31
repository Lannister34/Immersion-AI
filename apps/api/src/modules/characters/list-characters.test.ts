import { describe, expect, it } from 'vitest';

import { type CharacterChatUsageRecord, resolveCharacterChatUsage } from './application/list-characters.js';

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
