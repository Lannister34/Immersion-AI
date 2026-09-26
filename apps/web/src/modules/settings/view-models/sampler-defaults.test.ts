import type { SamplerPresetInput } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';

import { resetSamplerToDefaults } from './sampler-defaults';

const TUNED_PRESET: SamplerPresetInput = {
  contextTrimStrategy: 'trim_start',
  maxContextLength: 16384,
  maxTokens: 900,
  minP: 0.1,
  name: 'Мой пресет',
  presencePenalty: 0.4,
  repeatPenalty: 1.2,
  repeatPenaltyRange: 512,
  temperature: 0.6,
  topK: 40,
  topP: 0.9,
};

describe('resetSamplerToDefaults', () => {
  it('returns every sampler value to its default and keeps the preset name', () => {
    expect(resetSamplerToDefaults(TUNED_PRESET)).toEqual({
      contextTrimStrategy: 'trim_middle',
      maxContextLength: 8192,
      maxTokens: 600,
      minP: 0.02,
      name: 'Мой пресет',
      presencePenalty: 0,
      repeatPenalty: 1.05,
      repeatPenaltyRange: 2048,
      temperature: 1,
      topK: 0,
      topP: 1,
    });
  });

  it('leaves the form it was given untouched', () => {
    const form = { ...TUNED_PRESET };

    resetSamplerToDefaults(form);

    expect(form).toEqual(TUNED_PRESET);
  });
});
