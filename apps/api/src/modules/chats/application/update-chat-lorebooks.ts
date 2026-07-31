import type { ChatSessionDto } from '@immersion/contracts/chats';

import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatNotFoundError } from './append-chat-messages.js';
import { toChatSessionResponse } from './chat-session-response.js';

export async function updateChatLorebooks(chatId: string, lorebookIds: string[]): Promise<ChatSessionDto> {
  const repository = new FileChatRepository();
  const session = await repository.updateGenericChatLorebooks(chatId, lorebookIds, new Date().toISOString());

  if (!session) {
    throw new ChatNotFoundError(chatId);
  }

  return toChatSessionResponse(session);
}
