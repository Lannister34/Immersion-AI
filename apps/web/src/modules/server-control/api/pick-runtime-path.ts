import {
  type PickRuntimePathCommand,
  PickRuntimePathCommandSchema,
  PickRuntimePathResponseSchema,
} from '@immersion/contracts/runtime';

import { apiPost } from '../../../shared/api/client';

export function pickRuntimePath(command: PickRuntimePathCommand) {
  return apiPost('/api/runtime/pick-path', command, PickRuntimePathCommandSchema, PickRuntimePathResponseSchema);
}
