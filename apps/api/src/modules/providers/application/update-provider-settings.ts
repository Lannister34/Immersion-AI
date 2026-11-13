import type { ProviderSettingsSnapshot, UpdateProviderSettingsCommand } from '@immersion/contracts/providers';

import { toProviderSettingsSnapshot } from '../domain/provider-settings-snapshot.js';
import type { ProviderSettingsRepository } from './provider-settings-repository.js';

export interface UpdateProviderSettingsDependencies {
  readonly providerSettings: Pick<ProviderSettingsRepository, 'read' | 'write'>;
}

export async function updateProviderSettings(
  command: UpdateProviderSettingsCommand,
  { providerSettings }: UpdateProviderSettingsDependencies,
): Promise<ProviderSettingsSnapshot> {
  await providerSettings.write(command);

  return toProviderSettingsSnapshot(providerSettings.read());
}
