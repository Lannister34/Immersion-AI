import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SettingsOverviewResponseSchema, UpdateSettingsProfileResponseSchema } from '@immersion/contracts/settings';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

describe('settings profile routes', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-settings-'));
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
  });

  afterEach(async () => {
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }
    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  it('PUT /profile persists profile fields back to user-settings.json and they reflect on the next overview', async () => {
    await fs.writeFile(
      path.join(temporaryDataRoot, 'user-settings.json'),
      JSON.stringify({
        userName: 'Old',
        userPersona: 'Old persona',
        systemPromptTemplate: '',
        responseLanguage: 'ru',
        streamingEnabled: true,
        thinkingEnabled: true,
        messageFormatting: { actionsItalic: true, quotesHighlighted: false },
      }),
    );

    const app = buildApiApp();

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

    const persisted = JSON.parse(
      await fs.readFile(path.join(temporaryDataRoot, 'user-settings.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(persisted.userName).toBe('New name');
    expect(persisted.streamingEnabled).toBe(false);

    await app.close();
  });

  it('PUT /profile preserves unrelated fields like samplerPresets', async () => {
    await fs.writeFile(
      path.join(temporaryDataRoot, 'user-settings.json'),
      JSON.stringify({
        userName: 'Keep me',
        samplerPresets: [
          {
            id: 'demo',
            name: 'Demo',
            context_trim_strategy: 'trim_middle',
            max_context_length: 8192,
            max_length: 600,
            min_p: 0.02,
            presence_penalty: 0,
            rep_pen: 1.05,
            rep_pen_range: 2048,
            temperature: 1,
            top_k: 0,
            top_p: 1,
          },
        ],
        activePresetId: 'demo',
      }),
    );

    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/profile',
      payload: {
        userName: 'Renamed',
        userPersona: '',
        systemPromptTemplate: '',
        responseLanguage: 'ru',
        streamingEnabled: true,
        thinkingEnabled: true,
        messageFormatting: { actionsItalic: true, quotesHighlighted: false },
      },
    });
    expect(response.statusCode).toBe(200);

    const persisted = JSON.parse(
      await fs.readFile(path.join(temporaryDataRoot, 'user-settings.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(persisted.userName).toBe('Renamed');
    expect(Array.isArray(persisted.samplerPresets)).toBe(true);
    expect((persisted.samplerPresets as unknown[]).length).toBe(1);
    expect(persisted.activePresetId).toBe('demo');

    await app.close();
  });

  it('PUT /profile rejects an empty user name', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/profile',
      payload: {
        userName: '   ',
        userPersona: '',
        systemPromptTemplate: '',
        responseLanguage: 'ru',
        streamingEnabled: true,
        thinkingEnabled: true,
        messageFormatting: { actionsItalic: true, quotesHighlighted: false },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });

    await app.close();
  });
});
