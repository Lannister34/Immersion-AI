import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createSerialQueue } from '../../../platform/concurrency/serial-queue.js';
import { createCapturingLogger } from '../../../test-support/capturing-logger.js';
import { createDeferred } from '../../../test-support/deferred.js';
import { useTemporaryDataRoot } from '../../../test-support/use-temporary-data-root.js';
import { UserSettingsFile } from './user-settings-file.js';

describe('UserSettingsFile', () => {
  const dataRoot = useTemporaryDataRoot();

  function settingsFileAt(fileName: string) {
    const logs = createCapturingLogger();
    const filePath = path.join(dataRoot(), fileName);
    const file = new UserSettingsFile({ filePath, logger: logs.logger, queue: createSerialQueue() });

    return { file, filePath, logs };
  }

  it('keeps both changes when two writers update concurrently', async () => {
    const { file, filePath } = settingsFileAt('user-settings.json');
    await fs.writeFile(filePath, JSON.stringify({ userName: 'Тестер' }), 'utf8');
    const firstHeld = createDeferred();

    const first = file.update(async (current) => {
      await firstHeld.promise;
      return { ...current, activePresetId: 'тёплый' };
    });
    const second = file.update((current) => ({ ...current, backendMode: 'builtin' }));
    firstHeld.resolve();
    await Promise.all([first, second]);

    expect(JSON.parse(await fs.readFile(filePath, 'utf8'))).toEqual({
      activePresetId: 'тёплый',
      backendMode: 'builtin',
      userName: 'Тестер',
    });
  });

  it('degrades a malformed file to an empty object and logs a warning', async () => {
    const { file, filePath, logs } = settingsFileAt('user-settings.json');
    await fs.writeFile(filePath, '{ "userName": "Тестер",', 'utf8');

    expect(file.read()).toEqual({});
    expect(logs.lines).toEqual([expect.objectContaining({ filePath, level: 'warn' })]);
  });

  it('degrades a JSON value that is not an object to an empty object and logs a warning', async () => {
    const { file, filePath, logs } = settingsFileAt('user-settings.json');
    await fs.writeFile(filePath, '["Тестер"]', 'utf8');

    expect(file.read()).toEqual({});
    expect(logs.lines).toEqual([expect.objectContaining({ filePath, level: 'warn' })]);
  });

  it('reads a missing file as empty and creates it, with its folder, on the first update', async () => {
    const { file, filePath, logs } = settingsFileAt(path.join('вложенная папка', 'user-settings.json'));

    expect(file.read()).toEqual({});
    await file.update((current) => ({ ...current, userName: 'Тестер' }));

    expect(JSON.parse(await fs.readFile(filePath, 'utf8'))).toEqual({ userName: 'Тестер' });
    expect(logs.lines).toEqual([]);
  });
});
