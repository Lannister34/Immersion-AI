export const settingsModuleId = 'settings' as const;

export { ReplyLimitExceedsContextError } from './application/reply-limit-exceeds-context-error.js';
export type {
  UserSettingsDocument,
  UserSettingsMutator,
  UserSettingsRecord,
} from './application/user-settings-document.js';
export { UserSettingsFile } from './infrastructure/user-settings-file.js';
export { settingsProblems } from './interface/http/settings-problems.js';
export { createSettingsModule, type SettingsModule, type SettingsModuleDependencies } from './settings-module.js';
