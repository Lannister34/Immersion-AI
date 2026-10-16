import { ProviderTypeSchema, type UpdateProviderSettingsCommand } from '@immersion/contracts/providers';
import type { z } from 'zod';

import { createDefaultProviderConfig, createDefaultProviderSettings } from './provider-settings.js';
import { storedProviderSettingsSchema } from './stored-provider-settings-schema.js';

export interface StoredUserSettingsRecord extends Record<string, unknown> {
  activeConnectionPresetId?: string;
  activeProvider?: string;
  backendMode?: string;
  connectionPresets?: unknown;
  providerConfigs?: unknown;
}

function migrateLegacyConnectionPresets(
  settings: z.infer<typeof storedProviderSettingsSchema>,
): Partial<UpdateProviderSettingsCommand> | null {
  if (!settings.connectionPresets || settings.connectionPresets.length === 0) {
    return null;
  }

  const activePreset =
    settings.connectionPresets.find((preset) => preset.id === settings.activeConnectionPresetId) ??
    settings.connectionPresets[0];

  if (!activePreset?.url) {
    return null;
  }

  const activeProvider = activePreset.provider ?? 'custom';

  return {
    activeProvider,
    providerConfigs: {
      [activeProvider]: {
        url: activePreset.url,
        ...(activePreset.apiKey ? { apiKey: activePreset.apiKey } : {}),
        ...(activePreset.model ? { model: activePreset.model } : {}),
      },
    },
  };
}

function mergeProviderConfigs(
  defaults: UpdateProviderSettingsCommand['providerConfigs'],
  ...overrides: Array<UpdateProviderSettingsCommand['providerConfigs'] | undefined>
): UpdateProviderSettingsCommand['providerConfigs'] {
  const result = {
    ...defaults,
  };

  for (const configs of overrides) {
    if (!configs) {
      continue;
    }

    for (const provider of ProviderTypeSchema.options) {
      if (!configs[provider]) {
        continue;
      }

      result[provider] = {
        ...(result[provider] ?? createDefaultProviderConfig(provider)),
        ...configs[provider],
      };
    }
  }

  return result;
}

export function normalizeStoredProviderSettings(raw: StoredUserSettingsRecord | null): UpdateProviderSettingsCommand {
  const defaults = createDefaultProviderSettings();

  if (!raw) {
    return defaults;
  }

  const stored = storedProviderSettingsSchema.parse(raw);
  const migrated = !stored.providerConfigs ? migrateLegacyConnectionPresets(stored) : null;

  const mode = stored.backendMode ?? defaults.mode;
  const activeProvider = stored.activeProvider ?? migrated?.activeProvider ?? defaults.activeProvider;
  const providerConfigs = mergeProviderConfigs(
    defaults.providerConfigs,
    migrated?.providerConfigs,
    stored.providerConfigs,
  );

  providerConfigs[activeProvider] ??= createDefaultProviderConfig(activeProvider);

  return {
    mode,
    activeProvider,
    providerConfigs,
  };
}
