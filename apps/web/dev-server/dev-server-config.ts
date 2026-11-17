import { DevServerEnvironmentSchema, LAN_ON_VALUES } from './dev-server-environment-schema.js';

export const LOOPBACK_HOST = '127.0.0.1';
export const ALL_IPV4_INTERFACES_HOST = '0.0.0.0';

export interface DevServerConfig {
  readonly apiProxyTarget: string;
  readonly host: typeof LOOPBACK_HOST | typeof ALL_IPV4_INTERFACES_HOST;
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

  return {
    apiProxyTarget: parsed.data.IMMERSION_API_PROXY_TARGET,
    host: lanAccess ? ALL_IPV4_INTERFACES_HOST : LOOPBACK_HOST,
  };
}
