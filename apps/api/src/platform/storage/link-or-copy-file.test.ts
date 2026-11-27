import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { linkOrCopyFile } from './link-or-copy-file.js';

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: link`), { code });
}

describe('linkOrCopyFile', () => {
  let root = '';
  let sourcePath = '';
  let targetDirectory = '';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-link-or-copy-'));
    targetDirectory = path.join(root, 'ветка.files');
    await fs.mkdir(path.join(root, 'source.files'));
    await fs.mkdir(targetDirectory);
    sourcePath = path.join(root, 'source.files', 'картинка 1.png');
    await fs.writeFile(sourcePath, 'image bytes');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { force: true, recursive: true });
  });

  it('links a file into another directory, and the link outlives the source name', async () => {
    const targetPath = path.join(targetDirectory, 'картинка 1.png');

    await expect(linkOrCopyFile(sourcePath, targetPath)).resolves.toBe('linked');
    expect((await fs.stat(targetPath)).nlink).toBe(2);

    await fs.rm(path.join(root, 'source.files'), { recursive: true });

    await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe('image bytes');
  });

  it('refuses to overwrite an existing target', async () => {
    const targetPath = path.join(targetDirectory, 'taken.png');
    await fs.writeFile(targetPath, 'other bytes');

    await expect(linkOrCopyFile(sourcePath, targetPath)).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe('other bytes');
  });

  it('reports a missing source instead of creating the target', async () => {
    const targetPath = path.join(targetDirectory, 'missing.png');

    await expect(linkOrCopyFile(path.join(root, 'source.files', 'missing.png'), targetPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(fs.access(targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    'EXDEV',
    'EPERM',
    'ENOTSUP',
    'ENOSYS',
    'EMLINK',
    'EISDIR',
  ])('copies when hard links are unsupported and fs.link fails with %s', async (code) => {
    vi.spyOn(fs, 'link').mockRejectedValueOnce(errnoError(code));
    const targetPath = path.join(targetDirectory, 'copy.png');

    await expect(linkOrCopyFile(sourcePath, targetPath)).resolves.toBe('copied');
    expect((await fs.stat(targetPath)).nlink).toBe(1);

    await fs.rm(path.join(root, 'source.files'), { recursive: true });

    await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe('image bytes');
  });

  it('refuses to overwrite an existing target when it falls back to a copy', async () => {
    vi.spyOn(fs, 'link').mockRejectedValueOnce(errnoError('EXDEV'));
    const targetPath = path.join(targetDirectory, 'taken.png');
    await fs.writeFile(targetPath, 'other bytes');

    await expect(linkOrCopyFile(sourcePath, targetPath)).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe('other bytes');
  });

  it('rethrows a link failure that a copy would not fix', async () => {
    vi.spyOn(fs, 'link').mockRejectedValueOnce(errnoError('EIO'));
    const targetPath = path.join(targetDirectory, 'broken.png');

    await expect(linkOrCopyFile(sourcePath, targetPath)).rejects.toMatchObject({ code: 'EIO' });
    await expect(fs.access(targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
