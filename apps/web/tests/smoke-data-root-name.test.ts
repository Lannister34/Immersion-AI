import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isSmokeDataRoot, smokeDataRootPrefix } from './smoke-data-root-name.js';

describe('smoke data root name', () => {
  let parent = '';

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'immersion-web-name-test-'));
  });

  afterEach(() => {
    fs.rmSync(parent, { force: true, recursive: true });
  });

  it('recognizes every directory mkdtemp creates from the prefix, because mkdtemp appends six ASCII letters or digits', () => {
    const created = Array.from({ length: 50 }, () => fs.mkdtempSync(smokeDataRootPrefix(parent)));

    expect(created.filter((root) => !isSmokeDataRoot(parent, root))).toEqual([]);
  });

  it('recognizes a root through a parent written with a trailing separator', () => {
    expect(isSmokeDataRoot(`${parent}${path.sep}`, path.join(parent, 'immersion-web-smoke-aB3dE9'))).toBe(true);
  });

  it.each([
    ['another tool', 'immersion-ci-aB3dE9'],
    ['a hand-made name', 'immersion-web-smoke-keep'],
    ['a longer suffix', 'immersion-web-smoke-aB3dE9x'],
    ['a shorter suffix', 'immersion-web-smoke-aB3dE'],
    ['a suffix outside ASCII', 'immersion-web-smoke-абвгде'],
    ['a suffix with a separator-like character', 'immersion-web-smoke-aB3.E9'],
    ['a suffix with an underscore', 'immersion-web-smoke-aB3_E9'],
  ])('refuses %s', (_case, name) => {
    expect(isSmokeDataRoot(parent, path.join(parent, name))).toBe(false);
  });

  it('refuses a well-formed name under another parent or deeper inside this one', () => {
    expect(isSmokeDataRoot(parent, path.join(os.homedir(), 'immersion-web-smoke-aB3dE9'))).toBe(false);
    expect(isSmokeDataRoot(parent, path.join(parent, 'nested', 'immersion-web-smoke-aB3dE9'))).toBe(false);
  });
});
