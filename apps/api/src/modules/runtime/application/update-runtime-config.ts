import type { RuntimeConfigCommand, RuntimeOverviewResponse } from '@immersion/contracts/runtime';

import { getRuntimeOverview, invalidateRuntimeModelScanCache } from './get-runtime-overview.js';
import { RuntimeConfigRepository } from './runtime-config-repository.js';

export async function updateRuntimeConfig(
  command: RuntimeConfigCommand,
  repository = new RuntimeConfigRepository(),
): Promise<RuntimeOverviewResponse> {
  const patch = command.modelsDirs ? { ...command, modelsDirs: [...new Set(command.modelsDirs)] } : command;

  await repository.merge(patch);
  invalidateRuntimeModelScanCache();

  return getRuntimeOverview();
}
