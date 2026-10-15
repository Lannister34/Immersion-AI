import { WebEnvironmentSchema } from './web-environment-schema';

export interface WebConfig {
  readonly apiOrigin: string | null;
}

export type WebEnvironment = Pick<ImportMetaEnv, 'VITE_API_BASE_URL'>;

export class WebConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid web configuration:\n${issues.map((issue) => `  ${issue}`).join('\n')}`);
    this.name = 'WebConfigError';
    this.issues = issues;
  }
}

export function parseWebConfig(env: WebEnvironment): WebConfig {
  const parsed = WebEnvironmentSchema.safeParse({ VITE_API_BASE_URL: env.VITE_API_BASE_URL?.trim() || undefined });

  if (!parsed.success) {
    throw new WebConfigError(
      parsed.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`),
    );
  }

  return { apiOrigin: parsed.data.VITE_API_BASE_URL ?? null };
}
