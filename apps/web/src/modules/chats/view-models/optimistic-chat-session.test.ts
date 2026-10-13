import type { ChatSessionDto } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import {
  appendOptimisticUserMessage,
  removeOptimisticMessageAtIndex,
  replaceOptimisticMessageContent,
  truncateOptimisticMessagesFromIndex,
} from './optimistic-chat-session';

const SESSION: ChatSessionDto = {
  characterAvatarUrl: null,
  characterId: 'maria',
  characterName: 'Мария',
  chat: {
    characterAvatarUrl: null,
    characterId: 'maria',
    characterName: 'Мария',
    createdAt: '2026-10-01T10:00:00.000Z',
    id: 'chat-1',
    lastMessagePreview: 'Привет!',
    lorebookIds: [],
    messageCount: 2,
    scenarioId: null,
    scenarioName: null,
    title: 'Прогулка',
    updatedAt: '2026-10-01T10:05:00.000Z',
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
  lorebookIds: [],
  messages: [
    {
      attachments: [],
      content: 'Здравствуй',
      createdAt: '2026-10-01T10:01:00.000Z',
      id: 'message-1',
      reasoning: null,
      role: 'user',
    },
    {
      attachments: [],
      content: 'Привет!',
      createdAt: '2026-10-01T10:05:00.000Z',
      id: 'message-2',
      reasoning: null,
      role: 'assistant',
    },
  ],
  scenarioId: null,
  scenarioName: null,
  userName: 'Миша',
};

describe('optimistic chat session updates', () => {
  it.each<[string, (session: ChatSessionDto) => ChatSessionDto]>([
    [
      'append',
      (session) =>
        appendOptimisticUserMessage(session, {
          content: 'Как дела?',
          createdAt: '2026-10-01T10:06:00.000Z',
          id: 'optimistic:1',
        }),
    ],
    ['replace', (session) => replaceOptimisticMessageContent(session, 2, 'Привет, Миша!')],
    ['remove', (session) => removeOptimisticMessageAtIndex(session, 2)],
    ['truncate', (session) => truncateOptimisticMessagesFromIndex(session, 2)],
  ])('%s changes only the transcript and leaves the backend-owned chat summary to the server', (_name, update) => {
    const next = update(SESSION);

    expect(next.messages).not.toEqual(SESSION.messages);
    expect({ ...next, messages: SESSION.messages }).toEqual(SESSION);
  });
});
