import fs from 'node:fs/promises';
import path from 'node:path';

import { CharacterIdSchema } from '@immersion/contracts/characters';
import { ScenarioDetailResponseSchema } from '@immersion/contracts/scenarios';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTestApi } from './test-support/use-test-api.js';

interface ResourceRoute {
  readonly method: 'DELETE' | 'GET';
  readonly module: string;
}

const TRAVERSAL_ROUTES: readonly ResourceRoute[] = [
  { method: 'DELETE', module: 'scenarios' },
  { method: 'GET', module: 'scenarios' },
  { method: 'DELETE', module: 'lorebooks' },
  { method: 'GET', module: 'lorebooks' },
  { method: 'DELETE', module: 'characters' },
  { method: 'GET', module: 'characters' },
];

describe('file-backed resource id contract', () => {
  it.each([
    '../user-settings.json',
    'nested/inner.json',
    'nested\\inner.json',
    'C:evil.json',
    '.hidden.json',
    '..',
    `null${String.fromCharCode(0)}byte.json`,
  ])('rejects %j, which would not stay a plain file name in its storage directory', (fileId) => {
    expect(CharacterIdSchema.safeParse(fileId).success).toBe(false);
  });

  it.each(['Мария Чернова.json', 'v1.2 final.json'])('accepts the human-readable name %s', (fileId) => {
    expect(CharacterIdSchema.safeParse(fileId).success).toBe(true);
  });
});

describe('path traversal through resource id routes', () => {
  const api = useTestApi();

  beforeEach(async () => {
    const { dataRoot, settings } = api();

    await fs.mkdir(path.join(dataRoot, 'scenarios'), { recursive: true });
    await fs.mkdir(path.join(dataRoot, 'worlds'), { recursive: true });
    await fs.mkdir(path.join(dataRoot, 'characters'), { recursive: true });
    await settings.write({ userName: 'Sentinel' });
  });

  const traversalId = encodeURIComponent('../user-settings.json');

  it.each(
    TRAVERSAL_ROUTES,
  )('rejects a traversal id on /api/$module ($method) with 400 without touching the file system', async ({
    method,
    module,
  }) => {
    const response = await api().app.inject({
      method,
      url: `/api/${module}/${traversalId}`,
    });

    expect(response.statusCode).toBe(400);
    expect(await api().settings.read()).toEqual({ userName: 'Sentinel' });
  });

  it('still serves scenario CRUD for names with spaces and Cyrillic characters', async () => {
    const { app } = api();

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
    const created = ScenarioDetailResponseSchema.parse(createResponse.json());

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
  });
});
