import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveContainedFilePath, UnsafeRepositoryFileIdError } from './contained-path.js';

describe('resolveContainedFilePath', () => {
  const directory = path.join(os.tmpdir(), 'immersion-containment');

  it.each([
    'scenario.json',
    'Анонимный чат.json',
  ])('resolves the plain file name %j to a direct child of the directory', (fileId) => {
    expect(resolveContainedFilePath(directory, fileId)).toBe(path.join(directory, fileId));
  });

  it.each([
    '..\\user-settings.json',
    'nested\\inner.json',
    'C:evil.json',
    'C:\\Windows\\evil.json',
  ])('rejects the Windows separator or drive prefix in %j on every platform, because stored data moves between systems', (fileId) => {
    expect(() => resolveContainedFilePath(directory, fileId)).toThrow(UnsafeRepositoryFileIdError);
  });

  it.each([
    '../user-settings.json',
    '../../user-settings.json',
    'nested/inner.json',
    '/etc/passwd',
  ])('rejects the path %j, which leaves the directory or names a nested file', (fileId) => {
    expect(() => resolveContainedFilePath(directory, fileId)).toThrow(UnsafeRepositoryFileIdError);
  });

  it.each(['', '.', '..', '.hidden.json'])('rejects %j, which is empty or starts with a dot', (fileId) => {
    expect(() => resolveContainedFilePath(directory, fileId)).toThrow(UnsafeRepositoryFileIdError);
  });

  it('rejects an absolute path even when contract validation was skipped', () => {
    expect(() => resolveContainedFilePath(directory, path.join(os.tmpdir(), 'outside.json'))).toThrow(
      UnsafeRepositoryFileIdError,
    );
  });
});
