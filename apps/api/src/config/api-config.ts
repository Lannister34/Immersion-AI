import path from 'node:path';

import { ApiEnvironmentSchema, type ApiLogLevel } from './api-environment-schema.js';
import { serializedOrigins } from './serialized-origins.js';

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
    webOrigins:
      environment.IMMERSION_WEB_ORIGINS ??
      serializedOrigins([`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`]),
    projectRoot,
    dataRoot: path.resolve(projectRoot, environment.IMMERSION_DATA_ROOT),
    logLevel: environment.IMMERSION_LOG_LEVEL,
  };
}
