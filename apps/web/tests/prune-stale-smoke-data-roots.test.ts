import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pruneStaleSmokeDataRoots } from './prune-stale-smoke-data-roots.js';

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function age(directory: string, ageMs: number) {
  const modifiedAt = new Date(NOW - ageMs);
  fs.utimesSync(directory, modifiedAt, modifiedAt);
}

describe('pruneStaleSmokeDataRoots', () => {
  let sandbox = '';
  let parent = '';

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'immersion-web-prune-test-'));
    parent = path.join(sandbox, 'temp');
    fs.mkdirSync(parent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(sandbox, { force: true, recursive: true });
  });

  function smokeRoot(name: string, ageMs: number) {
    const root = path.join(parent, name);
    fs.mkdirSync(path.join(root, 'chats', '_no_character_'), { recursive: true });
    fs.writeFileSync(path.join(root, 'chats', '_no_character_', 'чат.jsonl'), '{"mes":"привет"}\n');
    age(root, ageMs);
    return root;
  }

  it('removes the smoke data roots untouched for longer than the maximum age, contents included', () => {
    const stale = smokeRoot('immersion-web-smoke-aB3dE9', MAX_AGE_MS + 1000);

    expect(pruneStaleSmokeDataRoots({ maxAgeMs: MAX_AGE_MS, now: NOW, parent })).toEqual({
      failed: [],
      removed: [stale],
    });
    expect(fs.existsSync(stale)).toBe(false);
  });

  it('reports a stale root it cannot remove and still removes the others', () => {
    const locked = smokeRoot('immersion-web-smoke-lock01', MAX_AGE_MS + 1000);
    const stale = smokeRoot('immersion-web-smoke-aB3dE9', MAX_AGE_MS + 1000);
    const busy = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    const rmSync = fs.rmSync;
    vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (target === locked) {
        throw busy;
      }
      rmSync(target, options);
    });

    expect(pruneStaleSmokeDataRoots({ maxAgeMs: MAX_AGE_MS, now: NOW, parent })).toEqual({
      failed: [{ directory: locked, error: busy }],
      removed: [stale],
    });
    expect(fs.readdirSync(parent)).toEqual(['immersion-web-smoke-lock01']);
  });

  it('reports a root it cannot stat, such as one a concurrent run is deleting, and still prunes the others', () => {
    const pending = smokeRoot('immersion-web-smoke-pend01', MAX_AGE_MS + 1000);
    const stale = smokeRoot('immersion-web-smoke-aB3dE9', MAX_AGE_MS + 1000);
    const denied = Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    const lstatSync = fs.lstatSync;
    vi.spyOn(fs, 'lstatSync').mockImplementation(((target: fs.PathLike, options?: fs.StatSyncOptions) => {
      if (target === pending) {
        throw denied;
      }
      return lstatSync(target, options);
    }) as typeof fs.lstatSync);

    expect(pruneStaleSmokeDataRoots({ maxAgeMs: MAX_AGE_MS, now: NOW, parent })).toEqual({
      failed: [{ directory: pending, error: denied }],
      removed: [stale],
    });
  });

  it('reports a parent it cannot list instead of throwing', () => {
    const missing = path.join(sandbox, 'вне-temp');

    const result = pruneStaleSmokeDataRoots({ maxAgeMs: MAX_AGE_MS, now: NOW, parent: missing });

    expect(result.removed).toEqual([]);
    expect(result.failed).toEqual([{ directory: missing, error: expect.objectContaining({ code: 'ENOENT' }) }]);
  });

  it('keeps a root that is younger than the maximum age or exactly that old', () => {
    smokeRoot('immersion-web-smoke-fresh1', 60 * 60 * 1000);
    smokeRoot('immersion-web-smoke-edge01', MAX_AGE_MS);

    expect(pruneStaleSmokeDataRoots({ maxAgeMs: MAX_AGE_MS, now: NOW, parent })).toEqual({ failed: [], removed: [] });
    expect(fs.readdirSync(parent).sort()).toEqual(['immersion-web-smoke-edge01', 'immersion-web-smoke-fresh1']);
  });

  it('leaves stale directories of other tools and hand-made names alone', () => {
    smokeRoot('immersion-ci-aB3dE9', MAX_AGE_MS * 10);
    smokeRoot('immersion-web-smoke-keep', MAX_AGE_MS * 10);
    smokeRoot('immersion-web-smoke-абвгде', MAX_AGE_MS * 10);

    expect(pruneStaleSmokeDataRoots({ maxAgeMs: MAX_AGE_MS, now: NOW, parent })).toEqual({ failed: [], removed: [] });
    expect(fs.readdirSync(parent).sort()).toEqual([
      'immersion-ci-aB3dE9',
      'immersion-web-smoke-keep',
      'immersion-web-smoke-абвгде',
    ]);
  });

  it('leaves a stale file that carries a smoke root name alone', () => {
    const file = path.join(parent, 'immersion-web-smoke-file01');
    fs.writeFileSync(file, 'not a directory');
    age(file, MAX_AGE_MS * 10);

    expect(pruneStaleSmokeDataRoots({ maxAgeMs: MAX_AGE_MS, now: NOW, parent })).toEqual({ failed: [], removed: [] });
    expect(fs.readFileSync(file, 'utf8')).toBe('not a directory');
  });

  it('leaves a stale link with a smoke root name alone and never follows it to its target', () => {
    const target = path.join(sandbox, 'outside');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'keep.txt'), 'kept');
    const link = path.join(parent, 'immersion-web-smoke-link01');
    fs.symlinkSync(target, link, 'junction');
    const modifiedAt = new Date(NOW - MAX_AGE_MS * 10);
    fs.lutimesSync(link, modifiedAt, modifiedAt);
    age(target, MAX_AGE_MS * 10);

    expect(pruneStaleSmokeDataRoots({ maxAgeMs: MAX_AGE_MS, now: NOW, parent })).toEqual({ failed: [], removed: [] });
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8')).toBe('kept');
  });

  it('does nothing in a parent without smoke data roots', () => {
    expect(pruneStaleSmokeDataRoots({ maxAgeMs: MAX_AGE_MS, now: NOW, parent })).toEqual({ failed: [], removed: [] });
  });
});
