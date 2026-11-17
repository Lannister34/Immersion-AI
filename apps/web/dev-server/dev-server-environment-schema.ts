import { z } from 'zod';

const DEFAULT_API_PROXY_TARGET = 'http://127.0.0.1:4787';
export const LAN_ON_VALUES = ['1', 'true', 'yes', 'on'] as const;
const LAN_OFF_VALUES = ['0', 'false', 'no', 'off'] as const;

function blankAsUnset(value: unknown): unknown {
  return typeof value === 'string' && value.trim().length === 0 ? undefined : value;
}

export const DevServerEnvironmentSchema = z.object({
  IMMERSION_API_PROXY_TARGET: z.preprocess(
    blankAsUnset,
    z.url({ protocol: /^https?$/u }).default(DEFAULT_API_PROXY_TARGET),
  ),
  IMMERSION_WEB_LAN: z.preprocess(
    (value) => (typeof value === 'string' ? blankAsUnset(value.trim().toLowerCase()) : value),
    z
      .enum([...LAN_ON_VALUES, ...LAN_OFF_VALUES], { error: 'must be one of 1, true, yes, on, 0, false, no, off' })
      .default('0'),
  ),
});
