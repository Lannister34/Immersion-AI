import {
  type ProviderConfig,
  type ProviderConfigs,
  ProviderConfigsSchema,
  ProviderModeSchema,
  type ProviderSettingsSnapshot,
  ProviderSettingsSnapshotSchema,
  type ProviderType,
  ProviderTypeSchema,
  type UpdateProviderSettingsCommand,
} from '@immersion/contracts/providers';
import { z } from 'zod';

import { getProviderDefaultModel, getProviderDefaultUrl, providerDefinitions } from './provider-catalog.js';

export const DEFAULT_OPENAI_COMPATIBLE_MODEL = 'local-model';

/**
 * Значения по умолчанию берём из каталога: у локальных серверов это адрес
 * и `local-model`, у облачных — только адрес, модель выбирает пользователь.
 */
function createDefaultProviderConfig(type: ProviderType): ProviderConfig {
  const model = getProviderDefaultModel(type);

  return {
    url: getProviderDefaultUrl(type),
    ...(model ? { model } : {}),
  };
}

function createDefaultProviderConfigs(): ProviderConfigs {
  const configs: ProviderConfigs = {};

  for (const type of ProviderTypeSchema.options) {
    configs[type] = createDefaultProviderConfig(type);
  }

  return configs;
}

const storedProviderSettingsSchema = z
  .object({
    backendMode: ProviderModeSchema.optional(),
    activeProvider: ProviderTypeSchema.optional(),
    providerConfigs: ProviderConfigsSchema.optional(),
    connectionPresets: z
      .array(
        z.object({
          id: z.string().min(1).optional(),
          provider: ProviderTypeSchema.optional(),
          url: z.string().min(1).optional(),
          apiKey: z.string().min(1).optional(),
          model: z.string().min(1).optional(),
        }),
      )
      .optional(),
    activeConnectionPresetId: z.string().min(1).optional(),
  })
  .passthrough();

export interface StoredUserSettingsRecord extends Record<string, unknown> {
  activeConnectionPresetId?: string;
  activeProvider?: string;
  backendMode?: string;
  connectionPresets?: unknown;
  providerConfigs?: unknown;
}

export function createDefaultProviderSettings(): UpdateProviderSettingsCommand {
  return {
    mode: 'builtin',
    activeProvider: 'custom',
    providerConfigs: createDefaultProviderConfigs(),
  };
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

export function toProviderSettingsSnapshot(command: UpdateProviderSettingsCommand): ProviderSettingsSnapshot {
  return ProviderSettingsSnapshotSchema.parse({
    ...command,
    providerDefinitions,
  });
}
