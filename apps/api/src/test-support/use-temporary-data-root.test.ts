import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { findProjectRoot } from '../config/find-project-root.js';
import { readDataRoot } from '../config/read-api-config.js';
import { useTemporaryDataRoot } from './use-temporary-data-root.js';

function isInside(parent: string, child: string) {
  const relative = path.relative(fs.realpathSync(parent), fs.realpathSync(child));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

describe('useTemporaryDataRoot', () => {
  const dataRoot = useTemporaryDataRoot();

  it('points the data-root variable at an empty temporary directory, away from the repository', () => {
    expect(readDataRoot()).toBe(dataRoot());
    expect(fs.readdirSync(dataRoot())).toEqual([]);
    expect(isInside(os.tmpdir(), dataRoot())).toBe(true);
    expect(isInside(findProjectRoot(import.meta.dirname), dataRoot())).toBe(false);
  });
});

describe('useTemporaryDataRoot cleanup', () => {
  const dataRoot = useTemporaryDataRoot();
  const finishedDataRoots: string[] = [];

  afterAll(() => {
    expect(finishedDataRoots.filter((finished) => fs.existsSync(finished))).toEqual([]);
  });

  it('removes the data root once the test finishes', () => {
    fs.writeFileSync(path.join(dataRoot(), 'written-by-the-test.json'), '{}');
    finishedDataRoots.push(dataRoot());

    expect(fs.existsSync(dataRoot())).toBe(true);
  });
});

describe('useTemporaryDataRoot with the smoke fixture', () => {
  const dataRoot = useTemporaryDataRoot('smoke');

  it('serves a copy of the smoke data', () => {
    expect(readDataRoot()).toBe(dataRoot());
    expect(fs.existsSync(path.join(dataRoot(), 'user-settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(dataRoot(), 'models', 'nested', 'secondary.gguf'))).toBe(true);
  });
});
