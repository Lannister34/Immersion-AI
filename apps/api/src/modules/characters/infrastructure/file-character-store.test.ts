import fs from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { createCapturingLogger } from '../../../test-support/capturing-logger.js';
import { failFileStatOf } from '../../../test-support/failing-file-stat.js';
import { useTemporaryDataRoot } from '../../../test-support/use-temporary-data-root.js';
import { createFileCharacterStore } from './file-character-store.js';

describe('createFileCharacterStore', () => {
  const dataRoot = useTemporaryDataRoot();
  const directory = (): string => path.join(dataRoot(), 'персонажи');

  beforeEach(async () => {
    await fs.mkdir(directory());
  });

  it('reads the image beside a card, and none for a card without one, without logging', async () => {
    await fs.writeFile(path.join(directory(), 'Ирис.webp'), 'image');
    const logs = createCapturingLogger();
    const store = createFileCharacterStore({ directory: directory(), logger: logs.logger });

    expect((await store.readCharacterAvatar('Ирис.json'))?.toString()).toBe('image');
    expect(await store.readCharacterAvatar('Без картинки.json')).toBeNull();
    expect(logs.lines).toEqual([]);
  });

  it('skips an avatar it cannot read and logs why to the logger it was given', async () => {
    await fs.writeFile(path.join(directory(), 'Ирис.png'), 'image');
    failFileStatOf('Ирис.png', 'EPERM');
    const logs = createCapturingLogger();
    const store = createFileCharacterStore({ directory: directory(), logger: logs.logger });

    expect(await store.readCharacterAvatar('Ирис.json')).toBeNull();
    expect(logs.lines).toEqual([expect.objectContaining({ characterId: 'Ирис.json', level: 'warn' })]);
  });

  it('stamps a saved card with the time it was given and keeps its first creation time', async () => {
    const store = createFileCharacterStore({ directory: directory(), logger: createCapturingLogger().logger });
    const fields = {
      description: '',
      exampleDialogue: '',
      firstMessage: 'Привет.',
      name: 'Ирис',
      personality: '',
      scenario: '',
      systemPrompt: '',
      tags: [],
    };

    const created = await store.createCharacter(fields, '2026-11-01T10:00:00.000Z');
    const updated = await store.writeCharacter(created.id, { ...fields, name: 'Ирис II' }, '2026-11-02T10:00:00.000Z');

    expect(updated).toMatchObject({
      createdAt: '2026-11-01T10:00:00.000Z',
      name: 'Ирис II',
      updatedAt: '2026-11-02T10:00:00.000Z',
    });
    expect(await store.readCharacterDetail(created.id)).toMatchObject({ updatedAt: '2026-11-02T10:00:00.000Z' });
  });
});
