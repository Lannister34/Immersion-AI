import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { directorySnapshot } from './directory-snapshot.js';
import { ensureSmokeDataRoot, removeSmokeDataRoot, resetSmokeData } from './smoke-data-root.js';
import { smokeFixtureDirectory } from './smoke-fixture-directory.js';

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

describe('smoke data root lifecycle', () => {
  let sandbox = '';
  let temp = '';

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'immersion-web-lifecycle-test-'));
    temp = path.join(sandbox, 'temp');
    fs.mkdirSync(temp);
    for (const variable of ['TEMP', 'TMP', 'TMPDIR']) {
      vi.stubEnv(variable, temp);
    }
    vi.stubEnv('IMMERSION_SMOKE_DATA_ROOT', undefined);
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    fs.rmSync(sandbox, { force: true, recursive: true });
  });

  it('reads the temporary directory from the stubbed environment', () => {
    expect(os.tmpdir()).toBe(temp);
  });

  it('creates one copy of the fixture in the runner and hands the same root to every later evaluation', () => {
    const root = ensureSmokeDataRoot();

    expect(path.dirname(root)).toBe(temp);
    expect(directorySnapshot(root)).toEqual(directorySnapshot(smokeFixtureDirectory));
    expect(process.env.IMMERSION_SMOKE_DATA_ROOT).toBe(root);
    expect(ensureSmokeDataRoot()).toBe(root);
    expect(fs.readdirSync(temp)).toEqual([path.basename(root)]);
  });

  function leakedRoot(name: string) {
    const leaked = path.join(temp, name);
    fs.mkdirSync(leaked);
    const longAgo = new Date(NOW - TWO_DAYS_MS);
    fs.utimesSync(leaked, longAgo, longAgo);
    return leaked;
  }

  it('prunes the stale roots a killed run left behind when it creates a root', () => {
    leakedRoot('immersion-web-smoke-leak01');

    const root = ensureSmokeDataRoot();

    expect(fs.readdirSync(temp)).toEqual([path.basename(root)]);
  });

  it('warns about a stale root it cannot remove and still creates its own', () => {
    const locked = leakedRoot('immersion-web-smoke-lock01');
    const rmSync = fs.rmSync;
    vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (target === locked) {
        throw new Error('EBUSY: resource busy or locked');
      }
      rmSync(target, options);
    });
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);

    const root = ensureSmokeDataRoot();

    expect(emitWarning).toHaveBeenCalledWith(expect.stringContaining(locked));
    expect(fs.readdirSync(temp).sort()).toEqual([path.basename(root), 'immersion-web-smoke-lock01'].sort());
  });

  it('does not prune when a worker evaluates the config with the inherited root', () => {
    const root = ensureSmokeDataRoot();
    const leaked = leakedRoot('immersion-web-smoke-leak02');

    expect(ensureSmokeDataRoot()).toBe(root);
    expect(fs.existsSync(leaked)).toBe(true);
  });

  it('restores the whole fixture into the root on reset', async () => {
    const root = ensureSmokeDataRoot();
    fs.mkdirSync(path.join(root, 'characters'));
    fs.writeFileSync(path.join(root, 'characters', 'смоук.json'), '{}');
    fs.writeFileSync(path.join(root, 'user-settings.json'), '{}');

    await resetSmokeData();

    expect(directorySnapshot(root)).toEqual(directorySnapshot(smokeFixtureDirectory));
  });

  it('removes the root at the end of the run', () => {
    const root = ensureSmokeDataRoot();

    removeSmokeDataRoot();

    expect(fs.existsSync(root)).toBe(false);
  });

  it('refuses an inherited root that this suite did not create, and leaves that directory untouched', async () => {
    const foreign = path.join(sandbox, 'data');
    fs.mkdirSync(foreign);
    fs.writeFileSync(path.join(foreign, 'user-settings.json'), '{"persona":{"name":"Владелец"}}');
    vi.stubEnv('IMMERSION_SMOKE_DATA_ROOT', foreign);

    expect(() => ensureSmokeDataRoot()).toThrow(/not a smoke data root/);
    await expect(resetSmokeData()).rejects.toThrow(/not a smoke data root/);
    expect(() => removeSmokeDataRoot()).toThrow(/not a smoke data root/);
    expect(directorySnapshot(foreign)).toEqual({ 'user-settings.json': '{"persona":{"name":"Владелец"}}' });
  });

  it('refuses an inherited root that is a junction to another directory, and leaves its target untouched', async () => {
    const target = path.join(sandbox, 'data');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'user-settings.json'), '{"persona":{"name":"Владелец"}}');
    const link = path.join(temp, 'immersion-web-smoke-link01');
    fs.symlinkSync(target, link, 'junction');
    vi.stubEnv('IMMERSION_SMOKE_DATA_ROOT', link);

    expect(() => ensureSmokeDataRoot()).toThrow(/not a directory/);
    await expect(resetSmokeData()).rejects.toThrow(/not a directory/);
    expect(() => removeSmokeDataRoot()).toThrow(/not a directory/);
    expect(directorySnapshot(target)).toEqual({ 'user-settings.json': '{"persona":{"name":"Владелец"}}' });
  });

  it('warns instead of failing the run when the teardown cannot remove the root', () => {
    const root = ensureSmokeDataRoot();
    const rmSync = fs.rmSync;
    vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (target === root) {
        throw new Error('EBUSY: resource busy or locked');
      }
      rmSync(target, options);
    });
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);

    expect(() => removeSmokeDataRoot()).not.toThrow();
    expect(emitWarning).toHaveBeenCalledWith(expect.stringContaining(root));
  });

  it('refuses to reset or remove before the config created a root', async () => {
    await expect(resetSmokeData()).rejects.toThrow(/not set/);
    expect(() => removeSmokeDataRoot()).toThrow(/not set/);
  });
});
