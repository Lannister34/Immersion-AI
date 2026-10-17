import fs from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSharedApiLogger } from '../../../platform/logging/shared-api-logger.js';
import { failFileStatOf } from '../../../test-support/failing-file-stat.js';
import { useTemporaryDataRoot } from '../../../test-support/use-temporary-data-root.js';
import { findCharacterAvatarFilePath } from './file-character-repository.js';

describe('findCharacterAvatarFilePath', () => {
  const dataRoot = useTemporaryDataRoot();

  beforeEach(async () => {
    await fs.mkdir(path.join(dataRoot(), 'characters'));
  });

  it('finds the image beside a card, and finds none for a card without one without logging', async () => {
    await fs.writeFile(path.join(dataRoot(), 'characters', 'Ирис.webp'), 'image');
    const warn = vi.spyOn(getSharedApiLogger(), 'warn').mockImplementation(() => undefined);

    expect(await findCharacterAvatarFilePath('Ирис.json')).toBe(path.join(dataRoot(), 'characters', 'Ирис.webp'));
    expect(await findCharacterAvatarFilePath('Без картинки.json')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips an avatar it cannot read and logs why instead of hiding the error', async () => {
    await fs.writeFile(path.join(dataRoot(), 'characters', 'Ирис.png'), 'image');
    failFileStatOf('Ирис.png', 'EPERM');
    const warn = vi.spyOn(getSharedApiLogger(), 'warn').mockImplementation(() => undefined);

    expect(await findCharacterAvatarFilePath('Ирис.json')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ characterId: 'Ирис.json' }), expect.any(String));
  });
});
