import {
  type ApplyRuntimeContextCommand,
  ApplyRuntimeContextCommandSchema,
  type RuntimeOverviewResponse,
  RuntimeOverviewResponseSchema,
} from '@immersion/contracts/runtime';

import { apiPost } from '../../../shared/api/client';

export function applyRuntimeContext(command: ApplyRuntimeContextCommand): Promise<RuntimeOverviewResponse> {
  return apiPost<ApplyRuntimeContextCommand, RuntimeOverviewResponse>(
    '/api/runtime/apply-context',
    command,
    ApplyRuntimeContextCommandSchema,
    RuntimeOverviewResponseSchema,
  );
}
