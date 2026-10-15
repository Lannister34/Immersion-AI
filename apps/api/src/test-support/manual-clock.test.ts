import { describe, expect, it } from 'vitest';

import { createManualClock } from './manual-clock.js';

describe('createManualClock', () => {
  it('advances by the configured step on each read', () => {
    const clock = createManualClock({ start: new Date('2026-10-15T09:00:00.000Z'), stepMs: 250 });

    const readings = [clock.now(), clock.now(), clock.now()].map((reading) => reading.toISOString());

    expect(readings).toEqual(['2026-10-15T09:00:00.000Z', '2026-10-15T09:00:00.250Z', '2026-10-15T09:00:00.500Z']);
  });

  it('moves forward on advance', () => {
    const clock = createManualClock({ start: new Date('2026-10-15T09:00:00.000Z'), stepMs: 0 });

    clock.advance(90_000);

    expect(clock.now().toISOString()).toBe('2026-10-15T09:01:30.000Z');
    expect(clock.now().toISOString()).toBe('2026-10-15T09:01:30.000Z');
  });

  it('refuses to move backwards or by a step that is not a finite number', () => {
    const clock = createManualClock();

    expect(() => clock.advance(-1)).toThrow(RangeError);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
    expect(() => createManualClock({ stepMs: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });
});
