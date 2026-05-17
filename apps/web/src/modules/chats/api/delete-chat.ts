import { apiDeleteNoContent } from '../../../shared/api/client';

export function deleteChat(chatId: string): Promise<void> {
  return apiDeleteNoContent(`/api/chats/${encodeURIComponent(chatId)}`);
}
