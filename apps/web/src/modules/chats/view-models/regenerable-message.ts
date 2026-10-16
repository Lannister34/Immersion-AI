import type { ChatMessageDto } from '@immersion/contracts/chats';

export function findRegenerableMessageIndex(messages: readonly Pick<ChatMessageDto, 'role'>[]): number | null {
  let firstReplyPosition = messages.length;

  while (firstReplyPosition > 0 && messages[firstReplyPosition - 1]?.role === 'assistant') {
    firstReplyPosition -= 1;
  }

  if (firstReplyPosition === messages.length || messages[firstReplyPosition - 1]?.role !== 'user') {
    return null;
  }

  return messages.length;
}
