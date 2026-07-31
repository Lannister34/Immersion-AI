import { type ChatMessageMutationResponse, ChatMessageMutationResponseSchema } from '@immersion/contracts/chats';

import { apiDelete } from '../../../shared/api/client';

export function deleteChatMessage(chatId: string, messageIndex: number): Promise<ChatMessageMutationResponse> {
  return apiDelete(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${messageIndex}`,
    ChatMessageMutationResponseSchema,
  );
}
