import type { RuntimeConfigCommand, RuntimeOverviewResponse } from '@immersion/contracts/runtime';

import { getRuntimeOverview, invalidateRuntimeModelScanCache } from './get-runtime-overview.js';
import { RuntimeConfigRepository } from './runtime-config-repository.js';

export async function updateRuntimeConfig(
  command: RuntimeConfigCommand,
  repository = new RuntimeConfigRepository(),
): Promise<RuntimeOverviewResponse> {
  const modelsDirs = [...new Set(command.modelsDirs)];

  await repository.write({ ...command, modelsDirs });
  invalidateRuntimeModelScanCache();

  return getRuntimeOverview();
}
