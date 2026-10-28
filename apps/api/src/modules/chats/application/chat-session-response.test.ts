import { describe, expect, it } from 'vitest';

import { type ChatSessionRecord, createDefaultChatGenerationSettings } from './chat-records.js';
import { toChatSessionResponse } from './chat-session-response.js';
import type { ProfileUserNameSource } from './chats-ports.js';

const STAMP = '2026-10-20T08:00:00.000Z';

function storedSession(userName: string | null): ChatSessionRecord {
  return {
    characterId: null,
    characterName: null,
    chat: {
      characterId: null,
      characterName: null,
      createdAt: STAMP,
      id: 'chat-1',
      lastMessagePreview: null,
      lorebookIds: [],
      messageCount: 0,
      scenarioId: null,
      scenarioName: null,
      title: 'Сказка',
      updatedAt: STAMP,
    },
    generationSettings: createDefaultChatGenerationSettings(),
    lorebookIds: [],
    messages: [],
    scenarioId: null,
    scenarioName: null,
    userName,
  };
}

function countingProfile(): ProfileUserNameSource & { readonly reads: () => number } {
  let reads = 0;

  return {
    getProfileUserName() {
      reads += 1;

      return 'Из профиля';
    },
    reads: () => reads,
  };
}

describe('toChatSessionResponse', () => {
  it('keeps the user name the chat stores without reading the profile', () => {
    const profile = countingProfile();

    expect(toChatSessionResponse(storedSession('Алексей'), profile).userName).toBe('Алексей');
    expect(profile.reads()).toBe(0);
  });

  it('falls back to the profile name for a chat that stores none', () => {
    const profile = countingProfile();

    expect(toChatSessionResponse(storedSession(null), profile).userName).toBe('Из профиля');
    expect(profile.reads()).toBe(1);
  });
});
