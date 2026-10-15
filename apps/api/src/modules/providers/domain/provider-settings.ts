import {
  type ProviderConfig,
  type ProviderConfigs,
  type ProviderType,
  ProviderTypeSchema,
  type UpdateProviderSettingsCommand,
} from '@immersion/contracts/providers';

import { getProviderDefaultModel, getProviderDefaultUrl } from './provider-catalog.js';

export const DEFAULT_OPENAI_COMPATIBLE_MODEL = 'local-model';

export function createDefaultProviderConfig(type: ProviderType): ProviderConfig {
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

export function createDefaultProviderSettings(): UpdateProviderSettingsCommand {
  return {
    mode: 'builtin',
    activeProvider: 'custom',
    providerConfigs: createDefaultProviderConfigs(),
  };
}
