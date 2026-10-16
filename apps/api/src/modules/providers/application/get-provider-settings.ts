import { toProviderSettingsSnapshot } from '../domain/provider-settings-snapshot.js';
import { ProviderSettingsRepository } from './provider-settings-repository.js';

export async function getProviderSettings(repository = new ProviderSettingsRepository()) {
  return toProviderSettingsSnapshot(await repository.read());
}
