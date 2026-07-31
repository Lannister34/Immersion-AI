import { readLegacyUserSettingsSource } from '../../../shared/infrastructure/legacy-settings-source.js';

/**
 * Raw persisted llm-server config from user settings. The stored shape is a
 * legacy blob, so it stays `unknown` here: the runtime module owns its
 * normalization via `normalizeRuntimeConfig`.
 */
export function getLlmServerRuntimeConfig(): unknown {
  return readLegacyUserSettingsSource().llmServerConfig;
}
