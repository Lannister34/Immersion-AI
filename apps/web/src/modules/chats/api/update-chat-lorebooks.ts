import {
  ChatSessionDtoSchema,
  type UpdateChatLorebooksCommand,
  UpdateChatLorebooksCommandSchema,
} from '@immersion/contracts/chats';

import { apiPut } from '../../../shared/api/client';

export function updateChatLorebooks(chatId: string, command: UpdateChatLorebooksCommand) {
  return apiPut(
    `/api/chats/${encodeURIComponent(chatId)}/lorebooks`,
    command,
    UpdateChatLorebooksCommandSchema,
    ChatSessionDtoSchema,
  );
}
