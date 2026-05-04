import type { ChatSessionDto } from '@immersion/contracts/chats';

import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatMessageNotFoundError, ChatNotFoundError } from './append-chat-messages.js';
import { toChatSessionResponse } from './chat-session-response.js';

interface TruncateChatMessagesInput {
  chatId: string;
  fromIndex: number;
  now: () => Date;
}

export async function truncateChatMessages({
  chatId,
  fromIndex,
  now,
}: TruncateChatMessagesInput): Promise<ChatSessionDto> {
  const chatRepository = new FileChatRepository();
  const existing = await chatRepository.getGenericChatSession(chatId);

  if (!existing) {
    throw new ChatNotFoundError(chatId);
  }

  if (fromIndex < 1 || fromIndex > existing.messages.length) {
    throw new ChatMessageNotFoundError(chatId, fromIndex);
  }

  const session = await chatRepository.truncateGenericChatMessagesFromIndex(chatId, fromIndex, now().toISOString());

  if (!session) {
    throw new ChatMessageNotFoundError(chatId, fromIndex);
  }

  return toChatSessionResponse(session);
}
