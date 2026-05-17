import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CharacterDetailResponseSchema, CharacterListResponseSchema } from '@immersion/contracts/characters';
import { LorebookDetailResponseSchema, LorebookListResponseSchema } from '@immersion/contracts/lorebooks';
import { ScenarioDetailResponseSchema, ScenarioListResponseSchema } from '@immersion/contracts/scenarios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

describe('library CRUD routes', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-library-'));
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
  });

  afterEach(async () => {
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }
    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  describe('scenarios', () => {
    it('creates, reads, updates and deletes a scenario through the HTTP API', async () => {
      const app = buildApiApp();

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/scenarios',
        payload: { name: 'Test scenario', concept: 'Concept', content: 'Body', tags: ['demo', 'ru'] },
      });
      const createPayload = ScenarioDetailResponseSchema.parse(createResponse.json());
      expect(createResponse.statusCode).toBe(201);
      expect(createPayload.scenario.name).toBe('Test scenario');
      expect(createPayload.scenario.tags).toEqual(['demo', 'ru']);
      expect(createPayload.scenario.id).toMatch(/^Test_scenario.*\.json$/);

      const listResponse = await app.inject({ method: 'GET', url: '/api/scenarios' });
      const listPayload = ScenarioListResponseSchema.parse(listResponse.json());
      expect(listPayload.items.find((item) => item.id === createPayload.scenario.id)).toBeDefined();

      const detailResponse = await app.inject({
        method: 'GET',
        url: `/api/scenarios/${encodeURIComponent(createPayload.scenario.id)}`,
      });
      const detailPayload = ScenarioDetailResponseSchema.parse(detailResponse.json());
      expect(detailPayload.scenario.content).toBe('Body');

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/scenarios/${encodeURIComponent(createPayload.scenario.id)}`,
        payload: { name: 'Test scenario', concept: 'New concept', content: 'New body', tags: ['demo'] },
      });
      const updatePayload = ScenarioDetailResponseSchema.parse(updateResponse.json());
      expect(updateResponse.statusCode).toBe(200);
      expect(updatePayload.scenario.concept).toBe('New concept');
      expect(updatePayload.scenario.content).toBe('New body');
      expect(updatePayload.scenario.tags).toEqual(['demo']);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/scenarios/${encodeURIComponent(createPayload.scenario.id)}`,
      });
      expect(deleteResponse.statusCode).toBe(204);

      const missingResponse = await app.inject({
        method: 'GET',
        url: `/api/scenarios/${encodeURIComponent(createPayload.scenario.id)}`,
      });
      expect(missingResponse.statusCode).toBe(404);
      expect(missingResponse.json()).toMatchObject({ code: 'scenario_not_found' });

      await app.close();
    });

    it('rejects an empty scenario name', async () => {
      const app = buildApiApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/scenarios',
        payload: { name: '   ', concept: '', content: '', tags: [] },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'validation_error' });
      await app.close();
    });
  });

  describe('characters', () => {
    it('creates, reads, updates and deletes a character through the HTTP API', async () => {
      const app = buildApiApp();

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/characters',
        payload: {
          name: 'Эля',
          description: 'Керамист, нервная под прессингом',
          personality: 'Замкнутая, перфекционистка',
          scenario: 'В студии после обжига',
          firstMessage: 'Привет, ты по поводу заказа?',
          exampleDialogue: '',
          systemPrompt: '',
          tags: ['ремесло', 'ru'],
        },
      });
      const createPayload = CharacterDetailResponseSchema.parse(createResponse.json());
      expect(createResponse.statusCode).toBe(201);
      expect(createPayload.character.source).toBe('json');
      expect(createPayload.character.isEditable).toBe(true);
      expect(createPayload.character.tags).toEqual(['ремесло', 'ru']);

      const listResponse = await app.inject({ method: 'GET', url: '/api/characters' });
      const listPayload = CharacterListResponseSchema.parse(listResponse.json());
      expect(listPayload.items.find((item) => item.id === createPayload.character.id)).toBeDefined();

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/characters/${encodeURIComponent(createPayload.character.id)}`,
        payload: {
          name: 'Эля',
          description: 'Керамист в студии «Меандр»',
          personality: 'Замкнутая, перфекционистка',
          scenario: 'В студии после обжига',
          firstMessage: 'Привет, ты по поводу заказа?',
          exampleDialogue: '',
          systemPrompt: '',
          tags: ['ремесло'],
        },
      });
      const updatePayload = CharacterDetailResponseSchema.parse(updateResponse.json());
      expect(updateResponse.statusCode).toBe(200);
      expect(updatePayload.character.description).toContain('«Меандр»');

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/characters/${encodeURIComponent(createPayload.character.id)}`,
      });
      expect(deleteResponse.statusCode).toBe(204);

      const missingResponse = await app.inject({
        method: 'GET',
        url: `/api/characters/${encodeURIComponent(createPayload.character.id)}`,
      });
      expect(missingResponse.statusCode).toBe(404);

      await app.close();
    });

    it('refuses to update a PNG character (read-only format)', async () => {
      const charactersDir = path.join(temporaryDataRoot, 'characters');
      await fs.mkdir(charactersDir, { recursive: true });
      const png = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
        'hex',
      );
      await fs.writeFile(path.join(charactersDir, 'Arina.png'), png);

      const app = buildApiApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/api/characters/Arina.png',
        payload: {
          name: 'Arina',
          description: '',
          personality: '',
          scenario: '',
          firstMessage: '',
          exampleDialogue: '',
          systemPrompt: '',
          tags: [],
        },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'character_not_editable' });

      await app.close();
    });
  });

  describe('lorebooks', () => {
    it('creates, reads, updates and deletes a lorebook through the HTTP API', async () => {
      const app = buildApiApp();

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/lorebooks',
        payload: {
          name: 'Студия «Меандр»',
          tags: ['ремесло'],
          entries: [
            { keys: ['Меандр', 'студия'], content: 'Локация: керамическая студия', enabled: true, priority: 5 },
          ],
        },
      });
      const createPayload = LorebookDetailResponseSchema.parse(createResponse.json());
      expect(createResponse.statusCode).toBe(201);
      expect(createPayload.lorebook.entries).toHaveLength(1);
      expect(createPayload.lorebook.entries[0]?.keys).toEqual(['Меандр', 'студия']);

      const listResponse = await app.inject({ method: 'GET', url: '/api/lorebooks' });
      const listPayload = LorebookListResponseSchema.parse(listResponse.json());
      expect(listPayload.items.find((item) => item.id === createPayload.lorebook.id)).toBeDefined();

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/lorebooks/${encodeURIComponent(createPayload.lorebook.id)}`,
        payload: {
          name: 'Студия «Меандр»',
          tags: ['ремесло', 'город'],
          entries: [
            { keys: ['Меандр'], content: 'Локация: керамическая студия в центре', enabled: false, priority: 10 },
            { keys: ['обжиг'], content: 'Процесс обжига занимает 12 часов', enabled: true, priority: 0 },
          ],
        },
      });
      const updatePayload = LorebookDetailResponseSchema.parse(updateResponse.json());
      expect(updateResponse.statusCode).toBe(200);
      expect(updatePayload.lorebook.entries).toHaveLength(2);
      expect(updatePayload.lorebook.entries[0]?.enabled).toBe(false);
      expect(updatePayload.lorebook.entries[0]?.priority).toBe(10);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/lorebooks/${encodeURIComponent(createPayload.lorebook.id)}`,
      });
      expect(deleteResponse.statusCode).toBe(204);

      const missingResponse = await app.inject({
        method: 'GET',
        url: `/api/lorebooks/${encodeURIComponent(createPayload.lorebook.id)}`,
      });
      expect(missingResponse.statusCode).toBe(404);

      await app.close();
    });
  });
});
