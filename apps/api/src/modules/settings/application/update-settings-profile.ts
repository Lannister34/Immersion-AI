import {
  type SettingsProfileSchema,
  type UpdateSettingsProfileCommand,
  type UpdateSettingsProfileResponse,
  UpdateSettingsProfileResponseSchema,
} from '@immersion/contracts/settings';
import type { z } from 'zod';

import {
  readLegacyUserSettingsSource,
  writeLegacyUserSettingsSource,
} from '../../../shared/infrastructure/legacy-settings-source.js';

type SettingsProfile = z.infer<typeof SettingsProfileSchema>;

export async function updateSettingsProfile(
  command: UpdateSettingsProfileCommand,
): Promise<UpdateSettingsProfileResponse> {
  const existing = readLegacyUserSettingsSource();

  const nextProfile: SettingsProfile = {
    userName: command.userName.trim(),
    userPersona: command.userPersona,
    systemPromptTemplate: command.systemPromptTemplate,
    uiLanguage: command.uiLanguage,
    responseLanguage: command.responseLanguage,
    streamingEnabled: command.streamingEnabled,
    thinkingEnabled: command.thinkingEnabled,
  };

  const next: Record<string, unknown> = {
    ...existing,
    userName: nextProfile.userName,
    userPersona: nextProfile.userPersona,
    systemPromptTemplate: nextProfile.systemPromptTemplate,
    uiLanguage: nextProfile.uiLanguage,
    responseLanguage: nextProfile.responseLanguage,
    streamingEnabled: nextProfile.streamingEnabled,
    thinkingEnabled: nextProfile.thinkingEnabled,
  };

  await writeLegacyUserSettingsSource(next);

  return UpdateSettingsProfileResponseSchema.parse({ profile: nextProfile });
}
