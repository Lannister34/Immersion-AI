import {
  type UpdateChatBindingsCommand,
  UpdateChatBindingsCommandSchema,
  type UpdateChatBindingsResponse,
  UpdateChatBindingsResponseSchema,
} from '@immersion/contracts/chats';

import { apiPatch } from '../../../shared/api/client';

export function updateChatBindings(
  chatId: string,
  command: UpdateChatBindingsCommand,
): Promise<UpdateChatBindingsResponse> {
  return apiPatch(
    `/api/chats/${encodeURIComponent(chatId)}/bindings`,
    command,
    UpdateChatBindingsCommandSchema,
    UpdateChatBindingsResponseSchema,
  );
}
