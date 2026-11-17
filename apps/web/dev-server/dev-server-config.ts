import { DevServerEnvironmentSchema, LAN_ON_VALUES, WEB_PASSWORD_MIN_LENGTH } from './dev-server-environment-schema.js';

export const LOOPBACK_HOST = '127.0.0.1';
export const ALL_IPV4_INTERFACES_HOST = '0.0.0.0';

export interface DevServerConfig {
  readonly apiProxyTarget: string;
  readonly host: typeof LOOPBACK_HOST | typeof ALL_IPV4_INTERFACES_HOST;
  readonly password: string | null;
}

export class DevServerConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid dev server configuration: ${issues.join('; ')}`);
    this.name = 'DevServerConfigError';
    this.issues = issues;
  }
}

export function parseDevServerConfig(env: Readonly<Record<string, string | undefined>>): DevServerConfig {
  const parsed = DevServerEnvironmentSchema.safeParse(env);

  if (!parsed.success) {
    throw new DevServerConfigError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }

  const lanAccess = (LAN_ON_VALUES as readonly string[]).includes(parsed.data.IMMERSION_WEB_LAN);
  const password = parsed.data.IMMERSION_WEB_PASSWORD ?? null;

  if (lanAccess && password === null) {
    throw new DevServerConfigError([
      `IMMERSION_WEB_PASSWORD: required when IMMERSION_WEB_LAN is on; set a password of at least ${WEB_PASSWORD_MIN_LENGTH} characters ` +
        `(доступ из сети включён без пароля: задайте IMMERSION_WEB_PASSWORD не короче ${WEB_PASSWORD_MIN_LENGTH} символов)`,
    ]);
  }

  return {
    apiProxyTarget: parsed.data.IMMERSION_API_PROXY_TARGET,
    host: lanAccess ? ALL_IPV4_INTERFACES_HOST : LOOPBACK_HOST,
    password,
  };
}
