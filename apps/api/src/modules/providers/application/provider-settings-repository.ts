import type { UpdateProviderSettingsCommand } from '@immersion/contracts/providers';

import type { UserSettingsDocument, UserSettingsRecord } from '../../settings/index.js';
import { normalizeStoredProviderSettings } from '../domain/normalize-stored-provider-settings.js';

export type ProviderSettingsChange = (current: UpdateProviderSettingsCommand) => UpdateProviderSettingsCommand;

export interface ProviderSettingsRepositoryOptions {
  readonly document: UserSettingsDocument;
}

function toStoredRecord(existing: UserSettingsRecord, next: UpdateProviderSettingsCommand): UserSettingsRecord {
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

  read(): UpdateProviderSettingsCommand {
    return normalizeStoredProviderSettings(this.document.read());
  }

  async write(next: UpdateProviderSettingsCommand): Promise<void> {
    await this.document.update((existing) => toStoredRecord(existing, next));
  }

  async update(change: ProviderSettingsChange): Promise<UpdateProviderSettingsCommand> {
    const stored = await this.document.update((existing) =>
      toStoredRecord(existing, change(normalizeStoredProviderSettings(existing))),
    );

    return normalizeStoredProviderSettings(stored);
  }
}
