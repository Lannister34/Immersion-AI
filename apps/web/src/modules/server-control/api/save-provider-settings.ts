import {
  type PatchProviderSettingsCommand,
  PatchProviderSettingsCommandSchema,
  type ProviderSettingsSnapshot,
  ProviderSettingsSnapshotSchema,
} from '@immersion/contracts/providers';

import { apiPatch } from '../../../shared/api/client';

export function saveProviderSettings(command: PatchProviderSettingsCommand): Promise<ProviderSettingsSnapshot> {
  return apiPatch<PatchProviderSettingsCommand, ProviderSettingsSnapshot>(
    '/api/providers/settings',
    command,
    PatchProviderSettingsCommandSchema,
    ProviderSettingsSnapshotSchema,
  );
}
