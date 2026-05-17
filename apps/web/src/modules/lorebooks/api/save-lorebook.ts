import {
  LorebookDetailResponseSchema,
  type SaveLorebookCommand,
  SaveLorebookCommandSchema,
} from '@immersion/contracts/lorebooks';

import { apiPost, apiPut } from '../../../shared/api/client';

export function updateLorebook(lorebookId: string, command: SaveLorebookCommand) {
  return apiPut(
    `/api/lorebooks/${encodeURIComponent(lorebookId)}`,
    command,
    SaveLorebookCommandSchema,
    LorebookDetailResponseSchema,
  );
}

export function createLorebook(command: SaveLorebookCommand) {
  return apiPost('/api/lorebooks', command, SaveLorebookCommandSchema, LorebookDetailResponseSchema);
}
