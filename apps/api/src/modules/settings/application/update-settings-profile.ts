import {
  type SettingsProfile,
  type UpdateSettingsProfileCommand,
  type UpdateSettingsProfileResponse,
  UpdateSettingsProfileResponseSchema,
} from '@immersion/contracts/settings';

import type { UserSettingsDocument } from './user-settings-document.js';

export interface UpdateSettingsProfileDependencies {
  readonly userSettings: Pick<UserSettingsDocument, 'update'>;
}

export async function updateSettingsProfile(
  command: UpdateSettingsProfileCommand,
  { userSettings }: UpdateSettingsProfileDependencies,
): Promise<UpdateSettingsProfileResponse> {
  const nextProfile: SettingsProfile = {
    userName: command.userName.trim(),
    userPersona: command.userPersona,
    systemPromptTemplate: command.systemPromptTemplate,
    responseLanguage: command.responseLanguage,
    streamingEnabled: command.streamingEnabled,
    thinkingEnabled: command.thinkingEnabled,
    messageFormatting: command.messageFormatting,
  };

  await userSettings.update((existing) => ({
    ...existing,
    userName: nextProfile.userName,
    userPersona: nextProfile.userPersona,
    systemPromptTemplate: nextProfile.systemPromptTemplate,
    responseLanguage: nextProfile.responseLanguage,
    streamingEnabled: nextProfile.streamingEnabled,
    thinkingEnabled: nextProfile.thinkingEnabled,
    messageFormatting: nextProfile.messageFormatting,
  }));

  return UpdateSettingsProfileResponseSchema.parse({ profile: nextProfile });
}
