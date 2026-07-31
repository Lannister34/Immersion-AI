import { RuntimeConfigCommandSchema } from '@immersion/contracts/runtime';

import { getRuntimeOverview, invalidateRuntimeModelScanCache } from './get-runtime-overview.js';
import { RuntimeConfigRepository } from './runtime-config-repository.js';

export async function updateRuntimeConfig(input: unknown, repository = new RuntimeConfigRepository()) {
  const command = RuntimeConfigCommandSchema.parse(input);
  const modelsDirs = [...new Set(command.modelsDirs)];

  await repository.write({ ...command, modelsDirs });
  invalidateRuntimeModelScanCache();

  return getRuntimeOverview();
}
