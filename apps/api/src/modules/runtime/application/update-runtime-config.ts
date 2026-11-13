import type { RuntimeConfigCommand, RuntimeOverviewResponse } from '@immersion/contracts/runtime';

import { type GetRuntimeOverviewDependencies, getRuntimeOverview } from './get-runtime-overview.js';
import type { ModelScanner } from './model-scanner.js';
import type { RuntimeConfigRepository } from './runtime-config-repository.js';

export interface UpdateRuntimeConfigDependencies extends GetRuntimeOverviewDependencies {
  readonly modelScanner: Pick<ModelScanner, 'invalidate' | 'scan'>;
  readonly runtimeConfig: Pick<RuntimeConfigRepository, 'merge' | 'read'>;
}

export async function updateRuntimeConfig(
  command: RuntimeConfigCommand,
  dependencies: UpdateRuntimeConfigDependencies,
): Promise<RuntimeOverviewResponse> {
  const patch = command.modelsDirs ? { ...command, modelsDirs: [...new Set(command.modelsDirs)] } : command;

  await dependencies.runtimeConfig.merge(patch);
  dependencies.modelScanner.invalidate();

  return getRuntimeOverview(dependencies);
}
