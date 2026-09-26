import type { UpdateProviderSettingsCommand } from '@immersion/contracts/providers';
import {
  readLegacyUserSettingsSource,
  updateLegacyUserSettingsSource,
} from '../../../shared/infrastructure/legacy-settings-source.js';
import { normalizeStoredProviderSettings, type StoredUserSettingsRecord } from '../domain/provider-settings.js';

export type ProviderSettingsChange = (current: UpdateProviderSettingsCommand) => UpdateProviderSettingsCommand;

function toStoredRecord(
  existing: Record<string, unknown>,
  next: UpdateProviderSettingsCommand,
): Record<string, unknown> {
  return {
    ...existing,
    backendMode: next.mode,
    activeProvider: next.activeProvider,
    providerConfigs: next.providerConfigs,
  };
}

export class ProviderSettingsRepository {
  async read() {
    const stored = readLegacyUserSettingsSource() as StoredUserSettingsRecord;

    return normalizeStoredProviderSettings(stored);
  }

  async write(next: UpdateProviderSettingsCommand) {
    await updateLegacyUserSettingsSource((existing) => toStoredRecord(existing, next));
  }

  async update(change: ProviderSettingsChange): Promise<UpdateProviderSettingsCommand> {
    const stored = await updateLegacyUserSettingsSource((existing) =>
      toStoredRecord(existing, change(normalizeStoredProviderSettings(existing))),
    );

    return normalizeStoredProviderSettings(stored);
  }
}
