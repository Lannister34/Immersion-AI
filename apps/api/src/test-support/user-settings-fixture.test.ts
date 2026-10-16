import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';
import { z } from 'zod';

import { storedSamplerPreset } from './stored-sampler-preset.js';
import { createUserSettingsFixtureFile } from './user-settings-fixture.js';

async function temporaryDataRoot() {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-settings-fixture-'));
  onTestFinished(() => fs.rm(dataRoot, { force: true, recursive: true }));

  return dataRoot;
}

describe('the user-settings fixture file', () => {
  it('writes the stored shape it is given and reads it back, Cyrillic included', async () => {
    const settings = createUserSettingsFixtureFile(await temporaryDataRoot());

    await settings.write({ samplerPresets: [storedSamplerPreset('default', 'По умолчанию')], userName: 'Тестер' });

    expect(settings.path.endsWith('user-settings.json')).toBe(true);
    expect(await settings.read()).toEqual({
      samplerPresets: [storedSamplerPreset('default', 'По умолчанию')],
      userName: 'Тестер',
    });
  });

  it('keeps fields its schema does not name, so a test can read what the app stored beside them', async () => {
    const settings = createUserSettingsFixtureFile(await temporaryDataRoot());
    await fs.writeFile(settings.path, JSON.stringify({ futureField: { nested: true }, userName: 'Misha' }), 'utf8');

    expect(await settings.read()).toEqual({ futureField: { nested: true }, userName: 'Misha' });
  });

  it('fails a read of a field with the wrong type instead of handing the test a misread file', async () => {
    const settings = createUserSettingsFixtureFile(await temporaryDataRoot());
    await fs.writeFile(settings.path, JSON.stringify({ modelPresetMap: { 'sandbox.gguf': 7 } }), 'utf8');

    await expect(settings.read()).rejects.toThrow(z.ZodError);
  });

  it('patches over the stored file, merging provider configs so the other providers stay', async () => {
    const settings = createUserSettingsFixtureFile(await temporaryDataRoot());
    await settings.write({
      providerConfigs: { koboldcpp: { url: 'http://127.0.0.1:5001' } },
      userName: 'Misha',
    });

    await settings.useExternalProvider({ url: 'http://127.0.0.1:6006' });

    expect(await settings.read()).toEqual({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: {
        custom: { apiKey: 'secret-token', model: 'smoke-model', url: 'http://127.0.0.1:6006' },
        koboldcpp: { url: 'http://127.0.0.1:5001' },
      },
      userName: 'Misha',
    });
  });

  it('patches a data root that has no settings file yet', async () => {
    const settings = createUserSettingsFixtureFile(await temporaryDataRoot());

    await settings.patch({ activePresetId: 'default' });

    expect(await settings.read()).toEqual({ activePresetId: 'default' });
  });

  it('finds a stored sampler preset by id and fails loudly on an id the file does not have', async () => {
    const settings = createUserSettingsFixtureFile(await temporaryDataRoot());
    await settings.write({
      samplerPresets: [
        storedSamplerPreset('default', 'По умолчанию'),
        storedSamplerPreset('холодный', 'Холодный', { temperature: 0.2 }),
      ],
    });

    expect(await settings.samplerPreset('холодный')).toEqual(
      storedSamplerPreset('холодный', 'Холодный', { temperature: 0.2 }),
    );
    await expect(settings.samplerPreset('missing')).rejects.toThrow('no sampler preset "missing"');
  });

  it('refuses to patch over a malformed file rather than reading it as empty', async () => {
    const settings = createUserSettingsFixtureFile(await temporaryDataRoot());
    await fs.writeFile(settings.path, '{ "userName": "Misha", "trunca', 'utf8');

    await expect(settings.patch({ activePresetId: 'default' })).rejects.toThrow(SyntaxError);
    expect(await fs.readFile(settings.path, 'utf8')).toBe('{ "userName": "Misha", "trunca');
  });
});
