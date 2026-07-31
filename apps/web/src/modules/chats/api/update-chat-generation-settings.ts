import {
  type UpdateChatGenerationSettingsCommand,
  UpdateChatGenerationSettingsCommandSchema,
  type UpdateChatGenerationSettingsResponse,
  UpdateChatGenerationSettingsResponseSchema,
} from '@immersion/contracts/chats';

import { apiPut } from '../../../shared/api/client';

export function updateChatGenerationSettings(
  chatId: string,
  command: UpdateChatGenerationSettingsCommand,
): Promise<UpdateChatGenerationSettingsResponse> {
  return apiPut(
    `/api/chats/${encodeURIComponent(chatId)}/generation-settings`,
    command,
    UpdateChatGenerationSettingsCommandSchema,
    UpdateChatGenerationSettingsResponseSchema,
  );
}
