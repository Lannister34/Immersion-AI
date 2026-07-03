import {
  type SettingsProfileSchema,
  type UpdateSettingsProfileCommand,
  type UpdateSettingsProfileResponse,
  UpdateSettingsProfileResponseSchema,
} from '@immersion/contracts/settings';
import type { z } from 'zod';

import { updateLegacyUserSettingsSource } from '../../../shared/infrastructure/legacy-settings-source.js';

type SettingsProfile = z.infer<typeof SettingsProfileSchema>;

export async function updateSettingsProfile(
  command: UpdateSettingsProfileCommand,
): Promise<UpdateSettingsProfileResponse> {
  const nextProfile: SettingsProfile = {
    userName: command.userName.trim(),
    userPersona: command.userPersona,
    systemPromptTemplate: command.systemPromptTemplate,
    uiLanguage: command.uiLanguage,
    responseLanguage: command.responseLanguage,
    streamingEnabled: command.streamingEnabled,
    thinkingEnabled: command.thinkingEnabled,
  };

  await updateLegacyUserSettingsSource((existing) => ({
    ...existing,
    userName: nextProfile.userName,
    userPersona: nextProfile.userPersona,
    systemPromptTemplate: nextProfile.systemPromptTemplate,
    uiLanguage: nextProfile.uiLanguage,
    responseLanguage: nextProfile.responseLanguage,
    streamingEnabled: nextProfile.streamingEnabled,
    thinkingEnabled: nextProfile.thinkingEnabled,
  }));

  return UpdateSettingsProfileResponseSchema.parse({ profile: nextProfile });
}
