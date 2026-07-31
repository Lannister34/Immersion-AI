import { GetChatSessionResponseSchema } from '@immersion/contracts/chats';

import { apiGet } from '../../../shared/api/client';

export function getChatSession(chatId: string) {
  return apiGet(`/api/chats/${encodeURIComponent(chatId)}`, GetChatSessionResponseSchema);
}
