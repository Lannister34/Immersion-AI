import { type RuntimeLogsResponse, RuntimeLogsResponseSchema } from '@immersion/contracts/runtime';

import type { RuntimeProcess } from './runtime-process.js';

export interface GetRuntimeLogsDependencies {
  readonly runtimeProcess: Pick<RuntimeProcess, 'getLogs' | 'getState'>;
}

export function getRuntimeLogs({ runtimeProcess }: GetRuntimeLogsDependencies): RuntimeLogsResponse {
  return RuntimeLogsResponseSchema.parse({
    lines: runtimeProcess.getLogs(),
    status: runtimeProcess.getState().status,
  });
}
