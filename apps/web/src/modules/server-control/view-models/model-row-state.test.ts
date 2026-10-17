import { describe, expect, it } from 'vitest';

import { toModelRowState } from './model-row-state';

const ACTIVE_MODEL = { isActive: true };
const IDLE_MODEL = { isActive: false };

describe('toModelRowState', () => {
  it('lets a model that failed to start be started again', () => {
    expect(toModelRowState(ACTIVE_MODEL, { status: 'error' })).toEqual({ canStart: true, isActive: true });
  });

  it.each(['starting', 'running', 'stopping'] as const)('hides start for the model the runtime is %s', (status) => {
    expect(toModelRowState(ACTIVE_MODEL, { status })).toEqual({ canStart: false, isActive: true });
  });

  it.each([
    'idle',
    'starting',
    'running',
    'stopping',
    'error',
  ] as const)('offers start on a model the API does not mark active while the runtime is %s', (status) => {
    expect(toModelRowState(IDLE_MODEL, { status })).toEqual({ canStart: true, isActive: false });
  });
});
