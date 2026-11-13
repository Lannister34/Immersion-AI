import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';

import { type GetRuntimeOverviewDependencies, getRuntimeOverview } from './get-runtime-overview.js';
import type { RuntimeProcess } from './runtime-process.js';

export interface StopRuntimeDependencies extends GetRuntimeOverviewDependencies {
  readonly runtimeProcess: Pick<RuntimeProcess, 'getEngineInfo' | 'getState' | 'stop'>;
}

export async function stopRuntime(dependencies: StopRuntimeDependencies): Promise<RuntimeOverviewResponse> {
  await dependencies.runtimeProcess.stop();

  return getRuntimeOverview(dependencies);
}
