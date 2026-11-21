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
  const { contextSize: _contextSizeComesFromThePreset, ...launchSettings } = command;
  const patch = launchSettings.modelsDirs
    ? { ...launchSettings, modelsDirs: [...new Set(launchSettings.modelsDirs)] }
    : launchSettings;

  await dependencies.runtimeConfig.merge(patch);
  dependencies.modelScanner.invalidate();

  return getRuntimeOverview(dependencies);
}
