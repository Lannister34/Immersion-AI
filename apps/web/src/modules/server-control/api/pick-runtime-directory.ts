import {
  type PickRuntimeDirectoryCommand,
  PickRuntimeDirectoryCommandSchema,
  PickRuntimeDirectoryResponseSchema,
} from '@immersion/contracts/runtime';

import { apiPost } from '../../../shared/api/client';

export function pickRuntimeDirectory(command: PickRuntimeDirectoryCommand) {
  return apiPost(
    '/api/runtime/pick-directory',
    command,
    PickRuntimeDirectoryCommandSchema,
    PickRuntimeDirectoryResponseSchema,
  );
}
