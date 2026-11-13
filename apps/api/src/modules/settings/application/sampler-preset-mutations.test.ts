import { describe, expect, it } from 'vitest';

import { createInMemoryUserSettings } from '../../../test-support/in-memory-user-settings.js';
import { deleteSamplerPreset, LastSamplerPresetError, SamplerPresetNotFoundError } from './sampler-preset-mutations.js';

const WARM_PRESET = { id: 'тёплый', max_context_length: 8192, max_length: 600, name: 'Тёплый', temperature: 1.1 };
const COLD_PRESET = { id: 'холодный', max_context_length: 8192, max_length: 600, name: 'Холодный', temperature: 0.2 };

describe('sampler preset mutations', () => {
  it('refuses to delete the last preset', async () => {
    const userSettings = createInMemoryUserSettings({ samplerPresets: [WARM_PRESET] });

    await expect(deleteSamplerPreset('тёплый', { userSettings })).rejects.toBeInstanceOf(LastSamplerPresetError);
    expect(userSettings.writes).toEqual([]);
    expect(userSettings.read()).toEqual({ samplerPresets: [WARM_PRESET] });
  });

  it('refuses to delete a preset it does not have', async () => {
    const userSettings = createInMemoryUserSettings({ samplerPresets: [WARM_PRESET, COLD_PRESET] });

    await expect(deleteSamplerPreset('нет такого', { userSettings })).rejects.toBeInstanceOf(
      SamplerPresetNotFoundError,
    );
    expect(userSettings.writes).toEqual([]);
  });

  it('moves the active preset and drops the bindings of the deleted one', async () => {
    const userSettings = createInMemoryUserSettings({
      activePresetId: 'тёплый',
      modelPresetMap: { 'Квен-14B.gguf': 'тёплый', 'Гемма.gguf': 'холодный' },
      samplerPresets: [WARM_PRESET, COLD_PRESET],
    });

    const { sampler } = await deleteSamplerPreset('тёплый', { userSettings });

    expect(sampler.activePresetId).toBe('холодный');
    expect(sampler.presets.map((preset) => preset.id)).toEqual(['холодный']);
    expect(sampler.modelBindings).toEqual([{ modelName: 'Гемма.gguf', presetId: 'холодный' }]);
  });
});
