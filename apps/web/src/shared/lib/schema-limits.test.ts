import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { numberLimitsOf } from './schema-limits';

describe('numberLimitsOf', () => {
  it('an integer with an exclusive minimum of 0 starts at 1', () => {
    const limits = numberLimitsOf(z.number().int().positive());

    expect(limits.integer).toBe(true);
    expect(limits.minimum).toBe(1);
  });

  it('turns exclusive integer bounds between whole numbers into the nearest whole numbers inside', () => {
    expect(numberLimitsOf(z.number().int().gt(0.5).lt(9.5))).toEqual({ integer: true, maximum: 9, minimum: 1 });
    expect(numberLimitsOf(z.number().int().gt(-1).lt(10))).toEqual({ integer: true, maximum: 9, minimum: 0 });
  });

  it('an unbounded number has no bounds', () => {
    expect(numberLimitsOf(z.number())).toEqual({ integer: false, maximum: null, minimum: null });
  });

  it('an integer has no bounds of its own beyond the safe integer range zod gives every integer', () => {
    expect(numberLimitsOf(z.number().int())).toEqual({ integer: true, maximum: null, minimum: null });
    expect(numberLimitsOf(z.number().int().positive())).toEqual({ integer: true, maximum: null, minimum: 1 });
  });

  it('reads both ends of a closed range through nullable', () => {
    expect(numberLimitsOf(z.number().min(-5).max(5).nullable())).toEqual({ integer: false, maximum: 5, minimum: -5 });
  });

  it('reads through optional and default', () => {
    const schema = z.number().int().min(2).max(9).nullable().optional().default(3);

    expect(numberLimitsOf(schema)).toEqual({ integer: true, maximum: 9, minimum: 2 });
  });

  it('refuses an exclusive bound on a fractional number instead of treating it as inclusive', () => {
    expect(() => numberLimitsOf(z.number().positive())).toThrow(TypeError);
    expect(() => numberLimitsOf(z.number().lt(1))).toThrow(TypeError);
  });

  it('refuses a union of numbers, which has no single range', () => {
    expect(() => numberLimitsOf(z.union([z.number().min(1), z.number().max(-1)]))).toThrow(TypeError);
  });
});
