import {
  type ProviderConfigView,
  type ProviderConfigViews,
  type ProviderSettingsSnapshot,
  ProviderSettingsSnapshotSchema,
  ProviderTypeSchema,
} from '@immersion/contracts/providers';

import { providerDefinitions } from './provider-catalog.js';
import type { ProviderConfig, ProviderSettings } from './provider-settings-schema.js';
import { readUsableApiKey } from './usable-api-key.js';

export function toProviderConfigView(config: ProviderConfig): ProviderConfigView {
  return {
    url: config.url,
    ...(config.model ? { model: config.model } : {}),
    apiKeyConfigured: readUsableApiKey(config.apiKey) !== null,
  };
}

export function toProviderSettingsSnapshot(settings: ProviderSettings): ProviderSettingsSnapshot {
  const providerConfigs: ProviderConfigViews = {};

  for (const type of ProviderTypeSchema.options) {
    const config = settings.providerConfigs[type];

    if (config) {
      providerConfigs[type] = toProviderConfigView(config);
    }
  }

  return ProviderSettingsSnapshotSchema.parse({
    mode: settings.mode,
    activeProvider: settings.activeProvider,
    providerConfigs,
    providerDefinitions,
  });
}
