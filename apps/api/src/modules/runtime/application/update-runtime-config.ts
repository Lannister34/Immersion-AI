import { RuntimeConfigCommandSchema } from '@immersion/contracts/runtime';

import { getRuntimeOverview, invalidateRuntimeModelScanCache } from './get-runtime-overview.js';
import { RuntimeConfigRepository } from './runtime-config-repository.js';

export async function updateRuntimeConfig(input: unknown, repository = new RuntimeConfigRepository()) {
  const command = RuntimeConfigCommandSchema.parse(input);

  await repository.write(command);
  invalidateRuntimeModelScanCache();

  return getRuntimeOverview();
}
