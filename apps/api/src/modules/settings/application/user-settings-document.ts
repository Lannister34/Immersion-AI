export type UserSettingsRecord = Record<string, unknown>;

export type UserSettingsMutator = (current: UserSettingsRecord) => UserSettingsRecord | Promise<UserSettingsRecord>;

export interface UserSettingsDocument {
  read(): UserSettingsRecord;
  update(mutate: UserSettingsMutator): Promise<UserSettingsRecord>;
}
