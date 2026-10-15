import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiConfigError } from './api-config.js';
import { readApiConfig, readDataRoot } from './read-api-config.js';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('readApiConfig', () => {
  beforeEach(() => {
    for (const key of [
      'IMMERSION_API_HOST',
      'IMMERSION_API_PORT',
      'IMMERSION_WEB_PORT',
      'IMMERSION_WEB_ORIGINS',
      'IMMERSION_DATA_ROOT',
      'IMMERSION_LOG_LEVEL',
    ]) {
      vi.stubEnv(key, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('finds the repository root from apps/api/src/config, so the default data root is <repo>/data', () => {
    expect(fs.existsSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'))).toBe(true);

    const config = readApiConfig();

    expect(config.projectRoot).toBe(repositoryRoot);
    expect(config.dataRoot).toBe(path.join(repositoryRoot, 'data'));
    expect(readDataRoot()).toBe(path.join(repositoryRoot, 'data'));
  });

  it('reads IMMERSION_DATA_ROOT from the process environment on every call', () => {
    const firstDataRoot = path.join(os.tmpdir(), 'immersion-first');
    const secondDataRoot = path.join(os.tmpdir(), 'immersion-second');

    vi.stubEnv('IMMERSION_DATA_ROOT', firstDataRoot);
    expect(readDataRoot()).toBe(firstDataRoot);

    vi.stubEnv('IMMERSION_DATA_ROOT', secondDataRoot);
    expect(readDataRoot()).toBe(secondDataRoot);
  });

  it('fails with an ApiConfigError naming the key when the process environment holds an invalid value', () => {
    vi.stubEnv('IMMERSION_API_PORT', '4787abc');

    expect(() => readApiConfig()).toThrow(ApiConfigError);
    expect(() => readApiConfig()).toThrow(/IMMERSION_API_PORT: must be a whole number from 1 to 65535/u);
  });
});
