import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatNotFoundError } from './append-chat-messages.js';

export async function deleteChat(chatId: string): Promise<void> {
  const chatRepository = new FileChatRepository();
  const deleted = await chatRepository.deleteGenericChat(chatId);

  if (!deleted) {
    throw new ChatNotFoundError(chatId);
  }
}
