import { describe, expect, it } from 'vitest';

import { WebLoginThrottle } from './web-login-throttle.js';

interface ThrottleSetup {
  readonly maxAddresses?: number;
  readonly globalFailureLimit?: number;
}

function throttleAt(clock: { now: number }, { globalFailureLimit = 100, maxAddresses = 8 }: ThrottleSetup = {}) {
  return new WebLoginThrottle({
    baseDelayMs: 1000,
    forgetAfterMs: 60_000,
    globalFailureLimit,
    globalWindowMs: 600_000,
    maxAddresses,
    maxDelayMs: 8000,
    now: () => clock.now,
  });
}

describe('WebLoginThrottle', () => {
  it('doubles the wait after each failure, up to the cap', () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);
    const delays = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      delays.push(throttle.recordFailure('10.0.0.5'));
      clock.now += throttle.retryAfterMs('10.0.0.5');
    }

    expect(delays).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it('reports the remaining wait and clears it on success', () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);

    throttle.recordFailure('10.0.0.5');
    clock.now += 400;
    expect(throttle.retryAfterMs('10.0.0.5')).toBe(600);

    throttle.recordSuccess('10.0.0.5');
    expect(throttle.retryAfterMs('10.0.0.5')).toBe(0);
    expect(throttle.recordFailure('10.0.0.5')).toBe(1000);
  });

  it('forgets old failures after a quiet period', () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock);

    throttle.recordFailure('10.0.0.5');
    throttle.recordFailure('10.0.0.5');
    clock.now += 2000 + 60_000;

    expect(throttle.recordFailure('10.0.0.5')).toBe(1000);
  });

  it('never drops a running penalty when the table is full; new addresses share one escalating bucket', () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock, { maxAddresses: 2 });

    throttle.recordFailure('10.0.0.1');
    throttle.recordFailure('10.0.0.2');
    expect(throttle.recordFailure('10.0.0.3')).toBe(1000);
    expect(throttle.retryAfterMs('10.0.0.1')).toBe(1000);

    clock.now += 1000;
    expect(throttle.recordFailure('10.0.0.4')).toBe(2000);
    expect(throttle.retryAfterMs('10.0.0.3')).toBe(2000);
  });

  it('frees table slots only for addresses whose failures are forgotten', () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock, { maxAddresses: 1 });

    throttle.recordFailure('10.0.0.1');
    clock.now += 1000 + 60_000;

    expect(throttle.recordFailure('10.0.0.2')).toBe(1000);
    expect(throttle.retryAfterMs('10.0.0.2')).toBe(1000);
    expect(throttle.retryAfterMs('10.0.0.3')).toBe(0);
  });

  it('holds every address off once too many failures arrive across all of them', () => {
    const clock = { now: 0 };
    const throttle = throttleAt(clock, { globalFailureLimit: 3, maxAddresses: 16 });

    throttle.recordFailure('10.0.0.1');
    throttle.recordFailure('10.0.0.2');
    expect(throttle.recordFailure('10.0.0.3')).toBe(600_000);
    expect(throttle.retryAfterMs('10.0.0.9')).toBe(600_000);

    clock.now += 600_000;
    expect(throttle.retryAfterMs('10.0.0.9')).toBe(0);
  });
});
