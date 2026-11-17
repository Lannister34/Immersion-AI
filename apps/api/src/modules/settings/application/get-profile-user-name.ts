import type { UserSettingsDocument } from './user-settings-document.js';

export const DEFAULT_USER_NAME = 'User';

export interface GetProfileUserNameDependencies {
  readonly userSettings: Pick<UserSettingsDocument, 'read'>;
}

export function getProfileUserName({ userSettings }: GetProfileUserNameDependencies): string {
  const candidate = userSettings.read().userName;

  return typeof candidate === 'string' && candidate.length > 0 ? candidate : DEFAULT_USER_NAME;
}
