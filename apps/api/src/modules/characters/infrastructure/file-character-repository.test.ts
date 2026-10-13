import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSharedApiLogger } from '../../../lib/logger.js';
import { failFileStatOf } from '../../../test-support/failing-file-stat.js';
import { findCharacterAvatarFilePath } from './file-character-repository.js';

describe('findCharacterAvatarFilePath', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-character-repository-'));
    await fs.mkdir(path.join(temporaryDataRoot, 'characters'));
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }

    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  it('finds the image beside a card, and finds none for a card without one without logging', async () => {
    await fs.writeFile(path.join(temporaryDataRoot, 'characters', 'Ирис.webp'), 'image');
    const warn = vi.spyOn(getSharedApiLogger(), 'warn').mockImplementation(() => undefined);

    expect(await findCharacterAvatarFilePath('Ирис.json')).toBe(
      path.join(temporaryDataRoot, 'characters', 'Ирис.webp'),
    );
    expect(await findCharacterAvatarFilePath('Без картинки.json')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips an avatar it cannot read and logs why instead of hiding the error', async () => {
    await fs.writeFile(path.join(temporaryDataRoot, 'characters', 'Ирис.png'), 'image');
    failFileStatOf('Ирис.png', 'EPERM');
    const warn = vi.spyOn(getSharedApiLogger(), 'warn').mockImplementation(() => undefined);

    expect(await findCharacterAvatarFilePath('Ирис.json')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ characterId: 'Ирис.json' }), expect.any(String));
  });
});
