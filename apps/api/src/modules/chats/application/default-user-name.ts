import { getProfileUserName } from '../../settings/application/get-profile-user-name.js';

/**
 * Chats delegate the default persona name to the settings module: settings owns
 * the profile user name and its 'User' fallback.
 */
export function getDefaultUserName() {
  return getProfileUserName();
}
