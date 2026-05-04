import type { ChatSessionDto } from '@immersion/contracts/chats';

import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatMessageNotFoundError, ChatNotFoundError } from './append-chat-messages.js';
import { toChatSessionResponse } from './chat-session-response.js';

interface UpdateChatMessageInput {
  chatId: string;
  content: string;
  messageIndex: number;
  now: () => Date;
}

export async function updateChatMessage({
  chatId,
  content,
  messageIndex,
  now,
}: UpdateChatMessageInput): Promise<ChatSessionDto> {
  const chatRepository = new FileChatRepository();
  const existing = await chatRepository.getGenericChatSession(chatId);

  if (!existing) {
    throw new ChatNotFoundError(chatId);
  }

  if (messageIndex < 1 || messageIndex > existing.messages.length) {
    throw new ChatMessageNotFoundError(chatId, messageIndex);
  }

  const session = await chatRepository.updateGenericChatMessage(chatId, messageIndex, content, now().toISOString());

  if (!session) {
    throw new ChatMessageNotFoundError(chatId, messageIndex);
  }

  return toChatSessionResponse(session);
}
