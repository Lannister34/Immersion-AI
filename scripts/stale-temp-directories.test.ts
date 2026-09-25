import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type TestContext, test } from 'node:test';

import {
  removeStaleTempDirectories,
  removeTempDirectory,
  selectStaleTempDirectories,
  type TempDirectoryEntry,
} from './stale-temp-directories.ts';

const HOUR_MS = 60 * 60 * 1000;
const NOW_MS = Date.UTC(2026, 8, 26, 12);

function entry(name: string, ageMs: number): TempDirectoryEntry {
  return { name, path: `/tmp/${name}`, modifiedMs: NOW_MS - ageMs };
}

function createFixtureRoot(t: TestContext): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'immersion-scripts-test-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return root;
}

function createDirectory(root: string, name: string, ageMs: number): string {
  const directory = path.join(root, name);
  mkdirSync(directory);
  const modified = new Date(NOW_MS - ageMs);
  utimesSync(directory, modified, modified);
  return directory;
}

test('selects only immersion-ci-* directories older than the limit', () => {
  const entries = [
    entry('immersion-ci-stale', 25 * HOUR_MS),
    entry('immersion-ci-fresh', 23 * HOUR_MS),
    entry('immersion-web-smoke-stale', 48 * HOUR_MS),
    entry('unrelated', 48 * HOUR_MS),
  ];

  assert.deepEqual(selectStaleTempDirectories(entries, NOW_MS), ['/tmp/immersion-ci-stale']);
});

test('keeps a directory whose age equals the limit', () => {
  assert.deepEqual(selectStaleTempDirectories([entry('immersion-ci-edge', 2 * HOUR_MS)], NOW_MS, 2 * HOUR_MS), []);
});

test('keeps a directory modified after now, as a clock skew does not make it stale', () => {
  assert.deepEqual(selectStaleTempDirectories([entry('immersion-ci-future', -HOUR_MS)], NOW_MS), []);
});

test('removes the stale immersion-ci-* directories under the root and nothing else', (t) => {
  const root = createFixtureRoot(t);
  const stale = createDirectory(root, 'immersion-ci-stale', 25 * HOUR_MS);
  const fresh = createDirectory(root, 'immersion-ci-fresh', HOUR_MS);
  const unrelated = createDirectory(root, 'unrelated', 48 * HOUR_MS);

  removeStaleTempDirectories(root, NOW_MS);

  assert.equal(existsSync(stale), false);
  assert.equal(existsSync(fresh), true);
  assert.equal(existsSync(unrelated), true);
});

test('deletes the linked node_modules that git worktree remove leaves behind, without following the links', (t) => {
  const root = createFixtureRoot(t);
  const linkTarget = path.join(root, 'store', 'pkg');
  mkdirSync(linkTarget, { recursive: true });
  writeFileSync(path.join(linkTarget, 'index.js'), '');
  const checkout = path.join(root, 'immersion-ci-checkout');
  mkdirSync(path.join(checkout, 'apps', 'api', 'node_modules'), { recursive: true });
  symlinkSync(linkTarget, path.join(checkout, 'apps', 'api', 'node_modules', 'pkg'), 'junction');

  removeTempDirectory(checkout);

  assert.equal(existsSync(checkout), false);
  assert.equal(existsSync(path.join(linkTarget, 'index.js')), true);
});
