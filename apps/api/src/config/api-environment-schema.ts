import { z } from 'zod';

import { isLoopbackAddress } from '../platform/net/loopback-address.js';
import { serializedOrigins } from './serialized-origins.js';

const API_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type ApiLogLevel = (typeof API_LOG_LEVELS)[number];

const PORT_RULE = 'must be a whole number from 1 to 65535';

const PortSchema = z
  .string()
  .regex(/^\d+$/u, PORT_RULE)
  .transform(Number)
  .refine((port) => port >= 1 && port <= 65_535, PORT_RULE);

function isWebOrigin(entry: string): boolean {
  if (!URL.canParse(entry)) {
    return false;
  }

  const url = new URL(entry);

  return (url.protocol === 'http:' || url.protocol === 'https:') && url.href === `${url.origin}/`;
}

const WebOriginsSchema = z.string().transform((value, context) => {
  const origins = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (origins.length === 0) {
    context.addIssue({ code: 'custom', message: 'must list at least one origin' });
  }

  for (const origin of origins.filter((entry) => !isWebOrigin(entry))) {
    context.addIssue({ code: 'custom', message: `"${origin}" is not an http(s) origin without a path` });
  }

  return serializedOrigins(origins.filter(isWebOrigin));
});

function isLoopbackBindHost(host: string): boolean {
  return host.toLowerCase() === 'localhost' || isLoopbackAddress(host);
}

const BindHostSchema = z
  .string()
  .refine(
    isLoopbackBindHost,
    'must be localhost or a loopback address in 127.0.0.0/8 or ::1; the API serves this computer only',
  );

export const ApiEnvironmentSchema = z.object({
  IMMERSION_API_HOST: BindHostSchema.default('127.0.0.1'),
  IMMERSION_API_PORT: PortSchema.default(4787),
  IMMERSION_WEB_PORT: PortSchema.default(4788),
  IMMERSION_WEB_ORIGINS: WebOriginsSchema.optional(),
  IMMERSION_DATA_ROOT: z.string().default('data'),
  IMMERSION_LOG_LEVEL: z.enum(API_LOG_LEVELS, { error: `must be one of ${API_LOG_LEVELS.join(', ')}` }).default('info'),
});
