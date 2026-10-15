import {
  SettingsOverviewResponseSchema,
  type UpdateSettingsProfileCommand,
  UpdateSettingsProfileResponseSchema,
} from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';

import { storedSamplerPreset } from './test-support/stored-sampler-preset.js';
import { useTestApi } from './test-support/use-test-api.js';

const PROFILE_COMMAND: UpdateSettingsProfileCommand = {
  userName: 'Renamed',
  userPersona: '',
  systemPromptTemplate: '',
  responseLanguage: 'ru',
  streamingEnabled: true,
  thinkingEnabled: true,
  messageFormatting: { actionsItalic: true, quotesHighlighted: false },
};

describe('settings profile routes', () => {
  const api = useTestApi();

  it('PUT /profile persists profile fields back to user-settings.json and they reflect on the next overview', async () => {
    const { app, settings } = api();
    await settings.write({
      userName: 'Old',
      userPersona: 'Old persona',
      systemPromptTemplate: '',
      responseLanguage: 'ru',
      streamingEnabled: true,
      thinkingEnabled: true,
      messageFormatting: { actionsItalic: true, quotesHighlighted: false },
    });

    const putResponse = await app.inject({
      method: 'PUT',
      url: '/api/settings/profile',
      payload: {
        userName: '  New name  ',
        userPersona: 'New persona description',
        systemPromptTemplate: 'Reply as {{char}}.',
        responseLanguage: 'en',
        streamingEnabled: false,
        thinkingEnabled: false,
        messageFormatting: { actionsItalic: true, quotesHighlighted: false },
      },
    });
    const putPayload = UpdateSettingsProfileResponseSchema.parse(putResponse.json());

    expect(putResponse.statusCode).toBe(200);
    expect(putPayload.profile.userName).toBe('New name');
    expect(putPayload.profile.userPersona).toBe('New persona description');
    expect(putPayload.profile.systemPromptTemplate).toBe('Reply as {{char}}.');
    expect(putPayload.profile.responseLanguage).toBe('en');
    expect(putPayload.profile.streamingEnabled).toBe(false);
    expect(putPayload.profile.thinkingEnabled).toBe(false);

    const overviewResponse = await app.inject({ method: 'GET', url: '/api/settings/overview' });
    const overview = SettingsOverviewResponseSchema.parse(overviewResponse.json());
    expect(overview.profile.userName).toBe('New name');
    expect(overview.profile.userPersona).toBe('New persona description');

    const persisted = await settings.read();
    expect(persisted.userName).toBe('New name');
    expect(persisted.streamingEnabled).toBe(false);
  });

  it('PUT /profile preserves unrelated fields like samplerPresets', async () => {
    const { app, settings } = api();
    const demoPreset = storedSamplerPreset('demo', 'Demo');
    await settings.write({
      userName: 'Keep me',
      samplerPresets: [demoPreset],
      activePresetId: 'demo',
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/profile',
      payload: PROFILE_COMMAND,
    });
    expect(response.statusCode).toBe(200);

    const persisted = await settings.read();
    expect(persisted.userName).toBe('Renamed');
    expect(persisted.samplerPresets).toEqual([demoPreset]);
    expect(persisted.activePresetId).toBe('demo');
  });

  it('PUT /profile rejects an empty user name', async () => {
    const response = await api().app.inject({
      method: 'PUT',
      url: '/api/settings/profile',
      payload: { ...PROFILE_COMMAND, userName: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
  });
});
