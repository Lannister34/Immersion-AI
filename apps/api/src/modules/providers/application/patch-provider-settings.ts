import {
  type PatchProviderSettingsCommand,
  type ProviderConfig,
  type ProviderSettingsSnapshot,
  UpdateProviderSettingsCommandSchema,
} from '@immersion/contracts/providers';

import { createDefaultProviderConfig } from '../domain/provider-settings.js';
import { toProviderSettingsSnapshot } from '../domain/provider-settings-snapshot.js';
import type { ProviderSettingsRepository } from './provider-settings-repository.js';

function mergeConfig(current: ProviderConfig, patch: PatchProviderSettingsCommand['config']): ProviderConfig {
  const next: ProviderConfig = { ...current };

  if (patch?.url) {
    next.url = patch.url;
  }

  if (patch?.model) {
    next.model = patch.model;
  }

  if (patch?.apiKey !== undefined) {
    if (patch.apiKey.trim().length > 0) {
      next.apiKey = patch.apiKey.trim();
    } else {
      delete next.apiKey;
    }
  }

  return next;
}

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

    return UpdateProviderSettingsCommandSchema.parse({
      activeProvider,
      mode: command.mode ?? current.mode,
      providerConfigs: {
        ...current.providerConfigs,
        [activeProvider]: mergeConfig(currentConfig, command.config),
      },
    });
  });

  return toProviderSettingsSnapshot(updated);
}
