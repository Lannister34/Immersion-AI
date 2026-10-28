import { ChatNotFoundError } from './append-chat-messages.js';
import type { ChatRepository } from './chat-repository.js';

export interface DeleteChatDependencies {
  readonly chatRepository: Pick<ChatRepository, 'deleteGenericChat'>;
}

export async function deleteChat(
  { chatId }: { chatId: string },
  { chatRepository }: DeleteChatDependencies,
): Promise<void> {
  const deleted = await chatRepository.deleteGenericChat(chatId);

  if (!deleted) {
    throw new ChatNotFoundError(chatId);
  }
}
