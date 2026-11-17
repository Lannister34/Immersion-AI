import type { UserSettingsDocument, UserSettingsRecord } from '../../settings/index.js';
import { normalizeStoredProviderSettings } from '../domain/normalize-stored-provider-settings.js';
import type { ProviderSettings } from '../domain/provider-settings-schema.js';

export type ProviderSettingsChange = (current: ProviderSettings) => ProviderSettings;

export interface ProviderSettingsRepositoryOptions {
  readonly document: UserSettingsDocument;
}

function toStoredRecord(existing: UserSettingsRecord, next: ProviderSettings): UserSettingsRecord {
  return {
    ...existing,
    backendMode: next.mode,
    activeProvider: next.activeProvider,
    providerConfigs: next.providerConfigs,
  };
}

export class ProviderSettingsRepository {
  private readonly document: UserSettingsDocument;

  constructor({ document }: ProviderSettingsRepositoryOptions) {
    this.document = document;
  }

  read(): ProviderSettings {
    return normalizeStoredProviderSettings(this.document.read());
  }

  async write(next: ProviderSettings): Promise<void> {
    await this.document.update((existing) => toStoredRecord(existing, next));
  }

  async update(change: ProviderSettingsChange): Promise<ProviderSettings> {
    const stored = await this.document.update((existing) =>
      toStoredRecord(existing, change(normalizeStoredProviderSettings(existing))),
    );

    return normalizeStoredProviderSettings(stored);
  }
}
