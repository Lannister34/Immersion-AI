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
    expect(parseDevServerConfig({})).toEqual({
      apiProxyTarget: 'http://127.0.0.1:4787',
      host: LOOPBACK_HOST,
      password: null,
    });
  });

  it('opens every IPv4 interface only for an explicit yes, in any case', () => {
    for (const value of ['1', 'true', 'TRUE', ' True ', 'yes', 'On']) {
      expect(parseDevServerConfig({ IMMERSION_WEB_LAN: value, IMMERSION_WEB_PASSWORD: '4821' }).host).toBe(
        ALL_IPV4_INTERFACES_HOST,
      );
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

  it('refuses to open the LAN without a password, in English and Russian', () => {
    expect(issuesOf({ IMMERSION_WEB_LAN: '1' })).toEqual([
      'IMMERSION_WEB_PASSWORD: required when IMMERSION_WEB_LAN is on; set a password of at least 4 characters ' +
        '(доступ из сети включён без пароля: задайте IMMERSION_WEB_PASSWORD не короче 4 символов)',
    ]);
    expect(issuesOf({ IMMERSION_WEB_LAN: '1', IMMERSION_WEB_PASSWORD: '   ' })).toHaveLength(1);
  });

  it('accepts a 4-digit PIN and refuses anything shorter', () => {
    expect(parseDevServerConfig({ IMMERSION_WEB_LAN: '1', IMMERSION_WEB_PASSWORD: '0042' }).password).toBe('0042');
    expect(issuesOf({ IMMERSION_WEB_LAN: '1', IMMERSION_WEB_PASSWORD: '123' })).toEqual([
      'IMMERSION_WEB_PASSWORD: must be at least 4 characters (пароль не короче 4 символов)',
    ]);
  });

  it('applies a set password with the LAN off too, so this computer asks for it as well', () => {
    expect(parseDevServerConfig({ IMMERSION_WEB_PASSWORD: '4821' })).toMatchObject({
      host: LOOPBACK_HOST,
      password: '4821',
    });
  });

  it('takes the API proxy target from its key and refuses one that is not an http(s) URL', () => {
    expect(parseDevServerConfig({ IMMERSION_API_PROXY_TARGET: 'http://127.0.0.1:4797' }).apiProxyTarget).toBe(
      'http://127.0.0.1:4797',
    );
    expect(issuesOf({ IMMERSION_API_PROXY_TARGET: 'ftp://127.0.0.1' })).toHaveLength(1);
  });
});
