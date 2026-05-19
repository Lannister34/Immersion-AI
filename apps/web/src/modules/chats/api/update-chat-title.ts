import {
  type UpdateChatTitleCommand,
  UpdateChatTitleCommandSchema,
  type UpdateChatTitleResponse,
  UpdateChatTitleResponseSchema,
} from '@immersion/contracts/chats';

import { apiPatch } from '../../../shared/api/client';

export function updateChatTitle(chatId: string, command: UpdateChatTitleCommand): Promise<UpdateChatTitleResponse> {
  return apiPatch(
    `/api/chats/${encodeURIComponent(chatId)}/title`,
    command,
    UpdateChatTitleCommandSchema,
    UpdateChatTitleResponseSchema,
  );
}
