import { describe, expect, it } from 'vitest';

import { type LaunchParamsFormState, parseLaunchParamsForm, toLaunchParamsForm } from './launch-params-form-state';

const VALID: LaunchParamsFormState = { flashAttention: true, gpuLayers: ' -1 ', threads: '0' };

describe('launch params form', () => {
  it('reads whole numbers back into the launch flags, trimming blanks, with no context, which comes from the preset', () => {
    expect(parseLaunchParamsForm(VALID)).toEqual({
      config: { flashAttention: true, gpuLayers: -1, threads: 0 },
    });
  });

  it('round-trips the launch flags through the form', () => {
    const config = { flashAttention: false, gpuLayers: 99, threads: 6 };

    expect(parseLaunchParamsForm(toLaunchParamsForm(config))).toEqual({ config });
  });

  it.each([
    ['', 'gpuLayers'],
    ['восемь', 'gpuLayers'],
    ['8.5', 'gpuLayers'],
    ['-1', 'threads'],
    ['1e4', 'threads'],
  ] as const)('refuses %j as %s', (value, field) => {
    expect(parseLaunchParamsForm({ ...VALID, [field]: value })).toEqual({ error: expect.any(String) });
  });
});
