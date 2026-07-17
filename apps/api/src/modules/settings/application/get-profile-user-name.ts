import { readLegacyUserSettingsSource } from '../../../shared/infrastructure/legacy-settings-source.js';

/** Settings owns the default persona name; other modules must consume it from here. */
export const DEFAULT_USER_NAME = 'User';

export function getProfileUserName(): string {
  const candidate = readLegacyUserSettingsSource().userName;

  return typeof candidate === 'string' && candidate.length > 0 ? candidate : DEFAULT_USER_NAME;
}
