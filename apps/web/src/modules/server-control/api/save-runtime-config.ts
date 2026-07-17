import {
  type RuntimeConfigCommand,
  RuntimeConfigCommandSchema,
  type RuntimeOverviewResponse,
  RuntimeOverviewResponseSchema,
} from '@immersion/contracts/runtime';

import { apiPut } from '../../../shared/api/client';

export function saveRuntimeConfig(command: RuntimeConfigCommand) {
  return apiPut<RuntimeConfigCommand, RuntimeOverviewResponse>(
    '/api/runtime/config',
    command,
    RuntimeConfigCommandSchema,
    RuntimeOverviewResponseSchema,
  );
}
