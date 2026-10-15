import type { ChatMessageRole, ChatSessionDto } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import { planChatReplyRegeneration } from './chat-reply-regeneration.js';
import { NoAssistantMessageToRegenerateError } from './generation-errors.js';

function buildSession(roles: ChatMessageRole[]): ChatSessionDto {
  return {
    characterAvatarUrl: null,
    characterId: null,
    characterName: null,
    chat: {
      characterAvatarUrl: null,
      characterId: null,
      characterName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'chat',
      lastMessagePreview: null,
      lorebookIds: [],
      messageCount: roles.length,
      scenarioId: null,
      scenarioName: null,
      title: 'Chat',
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
    lorebookIds: [],
    messages: roles.map((role, index) => ({
      attachments: [],
      content: `${role} ${index + 1}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      id: `chat:${index + 1}`,
      reasoning: null,
      role,
    })),
    scenarioId: null,
    scenarioName: null,
    userName: 'Tester',
  };
}

const transcriptsWithNothingToRegenerate: Array<{ name: string; roles: ChatMessageRole[] }> = [
  { name: 'an empty transcript', roles: [] },
  { name: 'a transcript that ends with a user message', roles: ['user', 'assistant', 'user'] },
  { name: 'a transcript that ends with a system line', roles: ['user', 'assistant', 'system'] },
  { name: 'a chat whose only message is the greeting', roles: ['assistant'] },
  { name: 'assistant replies that follow a system line', roles: ['user', 'system', 'assistant'] },
];

describe('planChatReplyRegeneration', () => {
  it('drops the single assistant reply after the last user turn', () => {
    const session = buildSession(['user', 'assistant']);

    expect(planChatReplyRegeneration(session)).toEqual({
      droppedMessages: [session.messages[1]],
      firstDroppedMessageIndex: 2,
      userMessage: session.messages[0],
    });
  });

  it('drops every trailing assistant reply in one step', () => {
    const session = buildSession(['user', 'assistant', 'user', 'assistant', 'assistant']);

    expect(planChatReplyRegeneration(session)).toEqual({
      droppedMessages: [session.messages[3], session.messages[4]],
      firstDroppedMessageIndex: 4,
      userMessage: session.messages[2],
    });
  });

  it.each(transcriptsWithNothingToRegenerate)('refuses $name', ({ roles }) => {
    expect(() => planChatReplyRegeneration(buildSession(roles))).toThrow(NoAssistantMessageToRegenerateError);
  });
});
