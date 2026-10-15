import {
  type ProviderSettingsSnapshot,
  ProviderSettingsSnapshotSchema,
  type UpdateProviderSettingsCommand,
} from '@immersion/contracts/providers';

import { providerDefinitions } from './provider-catalog.js';

export function toProviderSettingsSnapshot(command: UpdateProviderSettingsCommand): ProviderSettingsSnapshot {
  return ProviderSettingsSnapshotSchema.parse({
    ...command,
    providerDefinitions,
  });
}
