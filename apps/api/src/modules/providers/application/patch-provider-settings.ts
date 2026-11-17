import type { PatchProviderSettingsCommand, ProviderSettingsSnapshot } from '@immersion/contracts/providers';

import { mergeProviderConfig } from '../domain/merge-provider-config.js';
import { createDefaultProviderConfig } from '../domain/provider-settings.js';
import { ProviderSettingsSchema } from '../domain/provider-settings-schema.js';
import { toProviderSettingsSnapshot } from '../domain/provider-settings-snapshot.js';
import type { ProviderSettingsRepository } from './provider-settings-repository.js';

export interface PatchProviderSettingsDependencies {
  readonly providerSettings: Pick<ProviderSettingsRepository, 'update'>;
}

export async function patchProviderSettings(
  command: PatchProviderSettingsCommand,
  { providerSettings }: PatchProviderSettingsDependencies,
): Promise<ProviderSettingsSnapshot> {
  const updated = await providerSettings.update((current) => {
    const activeProvider = command.activeProvider ?? current.activeProvider;
    const currentConfig = current.providerConfigs[activeProvider] ?? createDefaultProviderConfig(activeProvider);

    return ProviderSettingsSchema.parse({
      activeProvider,
      mode: command.mode ?? current.mode,
      providerConfigs: {
        ...current.providerConfigs,
        [activeProvider]: mergeProviderConfig(currentConfig, command.config),
      },
    });
  });

  return toProviderSettingsSnapshot(updated);
}
