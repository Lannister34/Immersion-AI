import { SamplerPresetInputSchema } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';

import { numberLimitsOf } from '../../../shared/lib/schema-limits';
import { SAMPLER_PARAMETER_FIELDS, type SamplerParameterField } from './sampler-parameter-fields';

const NON_NUMERIC_PRESET_KEYS = new Set(['contextTrimStrategy', 'name']);

function presetLimitsOf(field: SamplerParameterField) {
  return numberLimitsOf(SamplerPresetInputSchema.shape[field.key]);
}

describe('SAMPLER_PARAMETER_FIELDS', () => {
  it('every numeric preset field has exactly one catalog entry', () => {
    const presetKeys = Object.keys(SamplerPresetInputSchema.shape).filter((key) => !NON_NUMERIC_PRESET_KEYS.has(key));
    const catalogKeys = SAMPLER_PARAMETER_FIELDS.map((field) => field.key);

    expect([...catalogKeys].sort()).toEqual([...presetKeys].sort());
  });

  it('every step is positive and fields the preset contract keeps whole step by whole numbers', () => {
    const offending = SAMPLER_PARAMETER_FIELDS.filter(
      (field) => field.step <= 0 || (presetLimitsOf(field).integer && !Number.isInteger(field.step)),
    );

    expect(offending.map((field) => field.key)).toEqual([]);
  });

  it('every step ceiling lies inside the range the preset contract allows', () => {
    const offending = SAMPLER_PARAMETER_FIELDS.filter((field) => {
      const { maximum, minimum } = presetLimitsOf(field);

      return (minimum !== null && field.stepCeiling <= minimum) || (maximum !== null && field.stepCeiling > maximum);
    });

    expect(offending.map((field) => field.key)).toEqual([]);
  });
});
