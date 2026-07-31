import {
  type ChatMessageMutationResponse,
  ChatMessageMutationResponseSchema,
  type UpdateChatMessageCommand,
  UpdateChatMessageCommandSchema,
} from '@immersion/contracts/chats';

import { apiPatch } from '../../../shared/api/client';

export function updateChatMessage(
  chatId: string,
  messageIndex: number,
  command: UpdateChatMessageCommand,
): Promise<ChatMessageMutationResponse> {
  return apiPatch(
    `/api/chats/${encodeURIComponent(chatId)}/messages/${messageIndex}`,
    command,
    UpdateChatMessageCommandSchema,
    ChatMessageMutationResponseSchema,
  );
}
