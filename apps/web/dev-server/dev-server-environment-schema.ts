import { z } from 'zod';

const DEFAULT_API_PROXY_TARGET = 'http://127.0.0.1:4787';
export const LAN_ON_VALUES = ['1', 'true', 'yes', 'on'] as const;
const LAN_OFF_VALUES = ['0', 'false', 'no', 'off'] as const;
export const WEB_PASSWORD_MIN_LENGTH = 4;
const WEB_PASSWORD_MAX_LENGTH = 256;

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
  IMMERSION_WEB_PASSWORD: z.preprocess(
    blankAsUnset,
    z
      .string()
      .min(WEB_PASSWORD_MIN_LENGTH, {
        error: `must be at least ${WEB_PASSWORD_MIN_LENGTH} characters (пароль не короче ${WEB_PASSWORD_MIN_LENGTH} символов)`,
      })
      .max(WEB_PASSWORD_MAX_LENGTH, { error: `must be at most ${WEB_PASSWORD_MAX_LENGTH} characters` })
      .optional(),
  ),
});
