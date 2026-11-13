import { describe, expect, it } from 'vitest';

import {
  ALL_IPV4_INTERFACES_HOST,
  DevServerConfigError,
  LOOPBACK_HOST,
  parseDevServerConfig,
} from './dev-server-config.js';

function issuesOf(env: Record<string, string>): readonly string[] {
  try {
    parseDevServerConfig(env);
  } catch (error) {
    if (error instanceof DevServerConfigError) return error.issues;
    throw error;
  }

  return [];
}

describe('parseDevServerConfig', () => {
  it('binds loopback and proxies to the local API when nothing is set', () => {
    expect(parseDevServerConfig({})).toEqual({ apiProxyTarget: 'http://127.0.0.1:4787', host: LOOPBACK_HOST });
  });

  it('opens every IPv4 interface only for an explicit yes, in any case', () => {
    for (const value of ['1', 'true', 'TRUE', ' True ', 'yes', 'On']) {
      expect(parseDevServerConfig({ IMMERSION_WEB_LAN: value }).host).toBe(ALL_IPV4_INTERFACES_HOST);
    }
  });

  it('stays on loopback for an explicit no or a blank value', () => {
    for (const value of ['0', 'false', 'FALSE', 'no', 'Off', '', '   ']) {
      expect(parseDevServerConfig({ IMMERSION_WEB_LAN: value }).host).toBe(LOOPBACK_HOST);
    }
  });

  it('refuses any other value instead of guessing', () => {
    expect(issuesOf({ IMMERSION_WEB_LAN: 'enabled' })).toEqual([
      'IMMERSION_WEB_LAN: must be one of 1, true, yes, on, 0, false, no, off',
    ]);
    expect(issuesOf({ IMMERSION_WEB_LAN: '192.168.1.10' })).toHaveLength(1);
  });

  it('takes the API proxy target from its key and refuses one that is not an http(s) URL', () => {
    expect(parseDevServerConfig({ IMMERSION_API_PROXY_TARGET: 'http://127.0.0.1:4797' }).apiProxyTarget).toBe(
      'http://127.0.0.1:4797',
    );
    expect(issuesOf({ IMMERSION_API_PROXY_TARGET: 'ftp://127.0.0.1' })).toHaveLength(1);
  });
});
