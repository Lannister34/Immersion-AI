import { type ImportChatCommand, ImportChatCommandSchema, ImportChatResponseSchema } from '@immersion/contracts/chats';

import { apiPost } from '../../../shared/api/client';

export function importChat(command: ImportChatCommand) {
  return apiPost('/api/chats/import', command, ImportChatCommandSchema, ImportChatResponseSchema);
}
