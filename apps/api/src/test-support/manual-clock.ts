import type { Clock } from '../platform/clock/clock.js';

export interface ManualClock extends Clock {
  advance(ms: number): void;
}

export interface ManualClockOptions {
  readonly start?: Date;
  readonly stepMs?: number;
}

const DEFAULT_START = new Date('2026-01-01T00:00:00.000Z');

function assertForwardStep(ms: number, name: string): void {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError(`A manual clock only moves forward: ${name} must be a finite number of 0 or more, got ${ms}`);
  }
}

export function createManualClock({ start = DEFAULT_START, stepMs = 1 }: ManualClockOptions = {}): ManualClock {
  assertForwardStep(stepMs, 'stepMs');
  let current = start.getTime();

  return {
    now() {
      const reading = new Date(current);
      current += stepMs;

      return reading;
    },
    advance(ms) {
      assertForwardStep(ms, 'advance(ms)');
      current += ms;
    },
  };
}
