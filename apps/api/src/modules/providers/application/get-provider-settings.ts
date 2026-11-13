import type { ProviderSettingsSnapshot } from '@immersion/contracts/providers';

import { toProviderSettingsSnapshot } from '../domain/provider-settings-snapshot.js';
import type { ProviderSettingsRepository } from './provider-settings-repository.js';

export interface GetProviderSettingsDependencies {
  readonly providerSettings: Pick<ProviderSettingsRepository, 'read'>;
}

export async function getProviderSettings({
  providerSettings,
}: GetProviderSettingsDependencies): Promise<ProviderSettingsSnapshot> {
  return toProviderSettingsSnapshot(providerSettings.read());
}
