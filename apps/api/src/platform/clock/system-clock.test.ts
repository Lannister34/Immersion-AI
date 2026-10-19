import { afterEach, describe, expect, it, vi } from 'vitest';

import { systemClock } from './system-clock.js';

describe('systemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the system time on every call rather than once at import', () => {
    vi.useFakeTimers({ now: new Date('2026-10-15T09:00:00.000Z') });
    const first = systemClock.now();

    vi.setSystemTime(new Date('2026-10-15T09:00:05.250Z'));
    const second = systemClock.now();

    expect(first.toISOString()).toBe('2026-10-15T09:00:00.000Z');
    expect(second.toISOString()).toBe('2026-10-15T09:00:05.250Z');
  });
});
