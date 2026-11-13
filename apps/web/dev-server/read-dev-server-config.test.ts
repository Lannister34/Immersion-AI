import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DevServerConfigError } from './dev-server-config.js';
import { readDevServerConfig } from './read-dev-server-config.js';

describe('readDevServerConfig', () => {
  let directory: string;
  let envFile: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'immersion-dev-server-config-'));
    envFile = join(directory, '.env.local');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('stays on loopback when there is no local env file', () => {
    expect(readDevServerConfig(envFile, {}).host).toBe('127.0.0.1');
  });

  it('opens the LAN when the local env file says so', () => {
    writeFileSync(envFile, 'IMMERSION_WEB_LAN=1\n');

    expect(readDevServerConfig(envFile, {}).host).toBe('0.0.0.0');
  });

  it('lets a non-blank process value close what the file opened', () => {
    writeFileSync(envFile, 'IMMERSION_WEB_LAN=1\n');

    expect(readDevServerConfig(envFile, { IMMERSION_WEB_LAN: '0' }).host).toBe('127.0.0.1');
  });

  it('refuses an invalid value in the file at startup', () => {
    writeFileSync(envFile, 'IMMERSION_WEB_LAN=enabled\n');

    expect(() => readDevServerConfig(envFile, {})).toThrow(DevServerConfigError);
  });

  it('rethrows a read error other than a missing file', () => {
    expect(() => readDevServerConfig(directory, {})).toThrow(/EISDIR/u);
  });
});
