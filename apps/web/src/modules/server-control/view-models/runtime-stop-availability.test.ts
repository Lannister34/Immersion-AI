import { describe, expect, it } from 'vitest';

import { canStopRuntime } from './runtime-stop-availability';

describe('canStopRuntime', () => {
  it.each([
    ['running', true],
    ['error', true],
    ['idle', false],
    ['starting', false],
    ['stopping', false],
  ] as const)('offers stop while running and after an error: %s -> %s', (status, expected) => {
    expect(canStopRuntime(status)).toBe(expected);
  });
});
