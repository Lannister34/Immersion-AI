import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CharacterIdSchema,
  SaveCharacterCommandSchema,
  UploadCharacterAvatarCommandSchema,
} from '@immersion/contracts/characters';
import { SaveLorebookCommandSchema } from '@immersion/contracts/lorebooks';
import { SaveScenarioCommandSchema, ScenarioDetailResponseSchema } from '@immersion/contracts/scenarios';
import { beforeEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { buildPng } from './test-support/png-image.js';
import { useTestApi } from './test-support/use-test-api.js';

interface ResourceRoute {
  readonly method: 'DELETE' | 'GET';
  readonly path: string;
}

interface ResourceWriteRoute {
  readonly path: string;
  readonly bodySchema: z.ZodType;
  readonly payload: object;
}

function writeRoute<BodySchema extends z.ZodType>(
  routePath: string,
  bodySchema: BodySchema,
  payload: z.input<BodySchema> & object,
): ResourceWriteRoute {
  return { path: routePath, bodySchema, payload };
}

const TRAVERSAL_ROUTES: readonly ResourceRoute[] = [
  { method: 'DELETE', path: 'scenarios/:id' },
  { method: 'GET', path: 'scenarios/:id' },
  { method: 'DELETE', path: 'lorebooks/:id' },
  { method: 'GET', path: 'lorebooks/:id' },
  { method: 'DELETE', path: 'characters/:id' },
  { method: 'GET', path: 'characters/:id' },
  { method: 'DELETE', path: 'characters/:id/avatar' },
  { method: 'GET', path: 'characters/:id/avatar' },
];

const WRITE_TRAVERSAL_ROUTES: readonly ResourceWriteRoute[] = [
  writeRoute('scenarios/:id', SaveScenarioCommandSchema, { name: 'Сценарий', concept: '', content: '', tags: [] }),
  writeRoute('lorebooks/:id', SaveLorebookCommandSchema, { name: 'Лорбук', tags: [], entries: [] }),
  writeRoute('characters/:id', SaveCharacterCommandSchema, { name: 'Персонаж' }),
  writeRoute('characters/:id/avatar', UploadCharacterAvatarCommandSchema, {
    contentBase64: buildPng().toString('base64'),
    mimeType: 'image/png',
  }),
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
  )('rejects a traversal id on $method /api/$path with 400 without touching the file system', async ({
    method,
    path: route,
  }) => {
    const response = await api().app.inject({ method, url: `/api/${route.replace(':id', traversalId)}` });

    expect(response.statusCode).toBe(400);
    expect(await api().settings.read()).toEqual({ userName: 'Sentinel' });
  });

  it.each(WRITE_TRAVERSAL_ROUTES)('rejects a traversal id on PUT /api/$path with 400 before writing anything', async ({
    path: route,
    bodySchema,
    payload,
  }) => {
    expect(bodySchema.safeParse(payload).success).toBe(true);
    const { app, dataRoot, settings } = api();
    const entriesBefore = await fs.readdir(dataRoot);

    const response = await app.inject({ method: 'PUT', url: `/api/${route.replace(':id', traversalId)}`, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
    expect(await settings.read()).toEqual({ userName: 'Sentinel' });
    expect(await fs.readdir(dataRoot)).toEqual(entriesBefore);
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
