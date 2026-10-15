import type { ChatMessageDto, ChatSessionDto } from '@immersion/contracts/chats';

import { NoAssistantMessageToRegenerateError } from './generation-errors.js';

export interface ChatReplyRegenerationPlan {
  readonly droppedMessages: readonly ChatMessageDto[];
  readonly firstDroppedMessageIndex: number;
  readonly userMessage: ChatMessageDto;
}

export function planChatReplyRegeneration(session: ChatSessionDto): ChatReplyRegenerationPlan {
  const { messages } = session;
  let firstDroppedPosition = messages.length;

  while (firstDroppedPosition > 0 && messages[firstDroppedPosition - 1]?.role === 'assistant') {
    firstDroppedPosition -= 1;
  }

  const userMessage = messages[firstDroppedPosition - 1];

  if (firstDroppedPosition === messages.length || userMessage?.role !== 'user') {
    throw new NoAssistantMessageToRegenerateError(session.chat.id);
  }

  return {
    droppedMessages: messages.slice(firstDroppedPosition),
    firstDroppedMessageIndex: firstDroppedPosition + 1,
    userMessage,
  };
}
