import path from 'node:path';

import { z } from 'zod';

const API_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type ApiLogLevel = (typeof API_LOG_LEVELS)[number];

export interface ApiConfig {
  readonly host: string;
  readonly port: number;
  readonly webPort: number;
  readonly webOrigins: readonly string[];
  readonly projectRoot: string;
  readonly dataRoot: string;
  readonly logLevel: ApiLogLevel;
}

export type ApiEnvironment = Readonly<Record<string, string | undefined>>;

export class ApiConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid API configuration:\n${issues.map((issue) => `  ${issue}`).join('\n')}`);
    this.name = 'ApiConfigError';
    this.issues = issues;
  }
}

const PORT_RULE = 'must be a whole number from 1 to 65535';

const PortSchema = z
  .string()
  .regex(/^\d+$/u, PORT_RULE)
  .transform(Number)
  .refine((port) => port >= 1 && port <= 65_535, PORT_RULE);

function serializedOrigin(entry: string): string {
  return new URL(entry).origin;
}

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

  return origins.filter(isWebOrigin).map(serializedOrigin);
});

const ApiEnvironmentSchema = z.object({
  IMMERSION_API_HOST: z.string().default('127.0.0.1'),
  IMMERSION_API_PORT: PortSchema.default(4787),
  IMMERSION_WEB_PORT: PortSchema.default(4788),
  IMMERSION_WEB_ORIGINS: WebOriginsSchema.optional(),
  IMMERSION_DATA_ROOT: z.string().default('data'),
  IMMERSION_LOG_LEVEL: z.enum(API_LOG_LEVELS, { error: `must be one of ${API_LOG_LEVELS.join(', ')}` }).default('info'),
});

function namedKeysWithBlankAsUnset(env: ApiEnvironment): Record<string, string | undefined> {
  return Object.fromEntries(Object.keys(ApiEnvironmentSchema.shape).map((key) => [key, env[key]?.trim() || undefined]));
}

export function parseApiConfig(env: ApiEnvironment, projectRoot: string): ApiConfig {
  const parsed = ApiEnvironmentSchema.safeParse(namedKeysWithBlankAsUnset(env));

  if (!parsed.success) {
    throw new ApiConfigError(
      parsed.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`),
    );
  }

  const environment = parsed.data;
  const webPort = environment.IMMERSION_WEB_PORT;

  return {
    host: environment.IMMERSION_API_HOST,
    port: environment.IMMERSION_API_PORT,
    webPort,
    webOrigins: environment.IMMERSION_WEB_ORIGINS ?? [
      serializedOrigin(`http://localhost:${webPort}`),
      serializedOrigin(`http://127.0.0.1:${webPort}`),
    ],
    projectRoot,
    dataRoot: path.resolve(projectRoot, environment.IMMERSION_DATA_ROOT),
    logLevel: environment.IMMERSION_LOG_LEVEL,
  };
}
