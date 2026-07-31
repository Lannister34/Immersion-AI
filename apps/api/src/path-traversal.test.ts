import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';
import { resolveContainedFilePath, UnsafeRepositoryFileIdError } from './lib/contained-path.js';

describe('resolveContainedFilePath', () => {
  const directory = path.join(os.tmpdir(), 'immersion-containment');

  it('resolves plain file names, including Cyrillic names with spaces', () => {
    expect(resolveContainedFilePath(directory, 'scenario.json')).toBe(path.join(directory, 'scenario.json'));
    expect(resolveContainedFilePath(directory, 'Анонимный чат.json')).toBe(path.join(directory, 'Анонимный чат.json'));
  });

  // Набор одинаков на любой ОС: на Linux «\» и «C:» — легальные символы имени файла,
  // и платформенная проверка пропускала бы то, что на Windows уже другой путь.
  it.each([
    '',
    '../user-settings.json',
    '..\\user-settings.json',
    '../../user-settings.json',
    'nested/inner.json',
    'nested\\inner.json',
    '..',
    '.',
    '.hidden.json',
    'C:evil.json',
    'C:\\Windows\\evil.json',
    '/etc/passwd',
  ])('rejects traversal id %s', (fileId) => {
    expect(() => resolveContainedFilePath(directory, fileId)).toThrow(UnsafeRepositoryFileIdError);
  });

  it('rejects absolute paths', () => {
    expect(() => resolveContainedFilePath(directory, path.join(os.tmpdir(), 'outside.json'))).toThrow(
      UnsafeRepositoryFileIdError,
    );
  });
});

describe('path traversal through resource id routes', () => {
  let dataRoot = '';

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-traversal-'));
    process.env.IMMERSION_DATA_ROOT = dataRoot;

    await fs.mkdir(path.join(dataRoot, 'scenarios'), { recursive: true });
    await fs.mkdir(path.join(dataRoot, 'worlds'), { recursive: true });
    await fs.mkdir(path.join(dataRoot, 'characters'), { recursive: true });
    await fs.writeFile(path.join(dataRoot, 'user-settings.json'), JSON.stringify({ userName: 'Sentinel' }), 'utf8');
  });

  afterEach(async () => {
    delete process.env.IMMERSION_DATA_ROOT;
    await fs.rm(dataRoot, { force: true, recursive: true });
  });

  const traversalId = encodeURIComponent('../user-settings.json');

  it.each([
    ['scenarios', 'DELETE'],
    ['scenarios', 'GET'],
    ['lorebooks', 'DELETE'],
    ['lorebooks', 'GET'],
    ['characters', 'DELETE'],
    ['characters', 'GET'],
  ] as const)('rejects a traversal id on /api/%s (%s) without touching the file system', async (module, method) => {
    const app = buildApiApp();
    const response = await app.inject({
      method,
      url: `/api/${module}/${traversalId}`,
    });

    expect([400, 404]).toContain(response.statusCode);
    await expect(fs.readFile(path.join(dataRoot, 'user-settings.json'), 'utf8')).resolves.toContain('Sentinel');

    await app.close();
  });

  it('still serves scenario CRUD for names with spaces and Cyrillic characters', async () => {
    const app = buildApiApp();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/scenarios',
      payload: {
        name: 'Тестовый сценарий',
        concept: 'Проверка',
        content: 'Содержимое',
        tags: [],
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { scenario: { id: string } };

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/scenarios/${encodeURIComponent(created.scenario.id)}`,
    });
    expect(getResponse.statusCode).toBe(200);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/scenarios/${encodeURIComponent(created.scenario.id)}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    await app.close();
  });
});
