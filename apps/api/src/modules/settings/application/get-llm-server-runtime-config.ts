import { readLegacyUserSettingsSource } from '../../../shared/infrastructure/legacy-settings-source.js';

export function getLlmServerRuntimeConfig(): unknown {
  return readLegacyUserSettingsSource().llmServerConfig;
}
