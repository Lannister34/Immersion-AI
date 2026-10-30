import { describe, expect, it } from 'vitest';

import { type LaunchParamsFormState, parseLaunchParamsForm, toLaunchParamsForm } from './launch-params-form-state';

const VALID: LaunchParamsFormState = { contextSize: ' 32256 ', flashAttention: true, gpuLayers: '-1', threads: '0' };

describe('launch params form', () => {
  it('reads whole numbers back into a launch config, trimming blanks', () => {
    expect(parseLaunchParamsForm(VALID)).toEqual({
      config: { contextSize: 32_256, flashAttention: true, gpuLayers: -1, threads: 0 },
    });
  });

  it('round-trips a launch config through the form', () => {
    const config = { contextSize: 8192, flashAttention: false, gpuLayers: 99, threads: 6 };

    expect(parseLaunchParamsForm(toLaunchParamsForm(config))).toEqual({ config });
  });

  it.each([
    ['', 'contextSize'],
    ['0', 'contextSize'],
    ['8192.5', 'contextSize'],
    ['1e4', 'contextSize'],
    ['восемь', 'gpuLayers'],
    ['-1', 'threads'],
  ] as const)('refuses %j as %s', (value, field) => {
    expect(parseLaunchParamsForm({ ...VALID, [field]: value })).toEqual({ error: expect.any(String) });
  });
});
