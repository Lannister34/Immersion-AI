import type { UpdateProviderSettingsCommand } from '@immersion/contracts/providers';
import {
  readLegacyUserSettingsSource,
  updateLegacyUserSettingsSource,
} from '../../../shared/infrastructure/legacy-settings-source.js';
import { normalizeStoredProviderSettings, type StoredUserSettingsRecord } from '../domain/provider-settings.js';

export class ProviderSettingsRepository {
  async read() {
    const stored = readLegacyUserSettingsSource() as StoredUserSettingsRecord;

    return normalizeStoredProviderSettings(stored);
  }

  async write(next: UpdateProviderSettingsCommand) {
    await updateLegacyUserSettingsSource((existing) => ({
      ...existing,
      backendMode: next.mode,
      activeProvider: next.activeProvider,
      providerConfigs: next.providerConfigs,
    }));
  }
}
