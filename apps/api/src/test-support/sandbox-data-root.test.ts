import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { findProjectRoot } from '../config/find-project-root.js';
import { readDataRoot } from '../config/read-api-config.js';
import { createSandboxDataRoot } from './sandbox-data-root.js';

function isInside(parent: string, child: string) {
  const relative = path.relative(fs.realpathSync(parent), fs.realpathSync(child));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

describe('the API test sandbox data root', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('gives a test that sets no data root a temporary one, never the real data under the project', () => {
    const dataRoot = readDataRoot();

    expect(isInside(os.tmpdir(), dataRoot)).toBe(true);
    expect(isInside(findProjectRoot(import.meta.dirname), dataRoot)).toBe(false);
  });

  it('claims the data root even when the shell already set one, so a test run never uses a real library', () => {
    const sandbox = createSandboxDataRoot();
    try {
      vi.stubEnv('IMMERSION_DATA_ROOT', 'D:/my-real-immersion-library');
      sandbox.claim();
      expect(process.env.IMMERSION_DATA_ROOT).toBe(sandbox.path);
    } finally {
      sandbox.remove();
    }
  });

  it('fills a blank data root and keeps one a test chose', () => {
    const sandbox = createSandboxDataRoot();
    try {
      vi.stubEnv('IMMERSION_DATA_ROOT', '   ');
      sandbox.fillIfUnset();
      expect(process.env.IMMERSION_DATA_ROOT).toBe(sandbox.path);

      vi.stubEnv('IMMERSION_DATA_ROOT', '/chosen/by/the/test');
      sandbox.fillIfUnset();
      expect(process.env.IMMERSION_DATA_ROOT).toBe('/chosen/by/the/test');
    } finally {
      sandbox.remove();
    }

    expect(fs.existsSync(sandbox.path)).toBe(false);
  });
});
