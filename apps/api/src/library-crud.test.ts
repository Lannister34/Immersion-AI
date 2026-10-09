import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { CharacterDetailResponseSchema, CharacterListResponseSchema } from '@immersion/contracts/characters';
import { LorebookDetailResponseSchema, LorebookListResponseSchema } from '@immersion/contracts/lorebooks';
import { ScenarioDetailResponseSchema, ScenarioListResponseSchema } from '@immersion/contracts/scenarios';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function buildChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  let crc = 0xff_ff_ff_ff;
  for (const byte of typeAndData) {
    crc = (crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE((crc ^ 0xff_ff_ff_ff) >>> 0, 0);
  return Buffer.concat([length, typeAndData, crcBuffer]);
}

function _decodePngCharaChunk(buffer: Buffer): { data: Record<string, unknown> } {
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (type === 'tEXt') {
      const data = buffer.subarray(dataStart, dataEnd);
      const nullIndex = data.indexOf(0);
      const keyword = data.subarray(0, nullIndex).toString('latin1');
      if (keyword === 'chara' || keyword === 'ccv3') {
        const text = data.subarray(nullIndex + 1).toString('latin1');
        const decoded = Buffer.from(text, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded) as Record<string, unknown>;
        const inner =
          parsed && typeof parsed === 'object' && 'data' in parsed && parsed.data && typeof parsed.data === 'object'
            ? (parsed.data as Record<string, unknown>)
            : parsed;
        return { data: inner };
      }
    }
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  throw new Error('Decoded PNG has no chara chunk.');
}

function buildPngWithCharaChunk(cardJson: string): Buffer {
  const width = 1;
  const height = 1;
  const bitDepth = 8;
  const grayscaleColorType = 0;
  const deflateCompression = 0;
  const adaptiveFiltering = 0;
  const noInterlace = 0;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(bitDepth, 8);
  ihdr.writeUInt8(grayscaleColorType, 9);
  ihdr.writeUInt8(deflateCompression, 10);
  ihdr.writeUInt8(adaptiveFiltering, 11);
  ihdr.writeUInt8(noInterlace, 12);

  const onePixelScanline = Buffer.from([0x00, 0x00]);
  const idatCompressed = zlib.deflateSync(onePixelScanline);

  const cardBase64 = Buffer.from(cardJson, 'utf8').toString('base64');
  const tEXt = Buffer.concat([Buffer.from('chara', 'ascii'), Buffer.from([0x00]), Buffer.from(cardBase64, 'latin1')]);

  return Buffer.concat([
    PNG_SIGNATURE,
    buildChunk('IHDR', ihdr),
    buildChunk('tEXt', tEXt),
    buildChunk('IDAT', idatCompressed),
    buildChunk('IEND', Buffer.alloc(0)),
  ]);
}

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
        payload: {
          name: 'Test scenario',
          concept: 'Concept',
          content: 'Body',
          firstMessage: '*{{char}} машет рукой.* Привет, {{user}}!',
          tags: ['demo', 'ru'],
        },
      });
      const createPayload = ScenarioDetailResponseSchema.parse(createResponse.json());
      expect(createResponse.statusCode).toBe(201);
      expect(createPayload.scenario.name).toBe('Test scenario');
      expect(createPayload.scenario.tags).toEqual(['demo', 'ru']);
      expect(createPayload.scenario.firstMessage).toBe('*{{char}} машет рукой.* Привет, {{user}}!');
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
      expect(detailPayload.scenario.firstMessage).toBe('*{{char}} машет рукой.* Привет, {{user}}!');

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/scenarios/${encodeURIComponent(createPayload.scenario.id)}`,
        payload: {
          name: 'Test scenario',
          concept: 'New concept',
          content: 'New body',
          firstMessage: 'Новое приветствие сцены.',
          tags: ['demo'],
        },
      });
      const updatePayload = ScenarioDetailResponseSchema.parse(updateResponse.json());
      expect(updateResponse.statusCode).toBe(200);
      expect(updatePayload.scenario.concept).toBe('New concept');
      expect(updatePayload.scenario.content).toBe('New body');
      expect(updatePayload.scenario.firstMessage).toBe('Новое приветствие сцены.');
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

    it('reads a legacy scenario file without firstMessage as an empty greeting', async () => {
      const scenariosDir = path.join(temporaryDataRoot, 'scenarios');
      await fs.mkdir(scenariosDir, { recursive: true });
      await fs.writeFile(
        path.join(scenariosDir, 'Legacy.json'),
        JSON.stringify({ name: 'Legacy', concept: 'Old concept', content: 'Old body' }),
        'utf8',
      );

      const app = buildApiApp();
      const detailResponse = await app.inject({ method: 'GET', url: '/api/scenarios/Legacy.json' });
      const detailPayload = ScenarioDetailResponseSchema.parse(detailResponse.json());
      expect(detailResponse.statusCode).toBe(200);
      expect(detailPayload.scenario.firstMessage).toBe('');

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

    it('reports chat usage stats from the chat index on the character list', async () => {
      const app = buildApiApp();

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/characters',
        payload: {
          name: 'Ирма',
          description: 'Хранительница архива',
          personality: '',
          scenario: '',
          firstMessage: 'Привет, что ищем сегодня?',
          exampleDialogue: '',
          systemPrompt: '',
          tags: [],
        },
      });
      const createPayload = CharacterDetailResponseSchema.parse(createResponse.json());
      expect(createResponse.statusCode).toBe(201);

      const beforeResponse = await app.inject({ method: 'GET', url: '/api/characters' });
      const beforePayload = CharacterListResponseSchema.parse(beforeResponse.json());
      expect(beforePayload.items.find((item) => item.id === createPayload.character.id)).toMatchObject({
        chatCount: 0,
        lastChatAt: null,
      });

      const chatResponse = await app.inject({
        method: 'POST',
        url: '/api/chats',
        payload: { characterId: createPayload.character.id },
      });
      expect(chatResponse.statusCode).toBe(201);

      const afterResponse = await app.inject({ method: 'GET', url: '/api/characters' });
      const afterPayload = CharacterListResponseSchema.parse(afterResponse.json());
      const afterItem = afterPayload.items.find((item) => item.id === createPayload.character.id);
      expect(afterItem?.chatCount).toBe(1);
      expect(afterItem?.lastChatAt).toBeTruthy();

      await app.close();
    });

    it('imports a SillyTavern PNG character card as one editable JSON character whose image is only its avatar', async () => {
      const cardJson = {
        spec: 'chara_card_v2',
        data: {
          name: 'Эмбер',
          description: 'Молодой дракон, любящий светлячков.',
          personality: 'Любопытный и мягкий.',
          scenario: 'Лесная поляна на закате.',
          first_mes: 'Привет, ты тоже пришёл за светлячками?',
        },
      };
      const png = buildPngWithCharaChunk(JSON.stringify(cardJson));

      const app = buildApiApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/characters/import',
        payload: {
          fileName: 'Ember.png',
          contentBase64: png.toString('base64'),
        },
      });
      const payload = CharacterDetailResponseSchema.parse(response.json());

      expect(response.statusCode).toBe(201);
      expect(payload.character.name).toBe('Эмбер');
      expect(payload.character.description).toContain('светлячков');
      expect(payload.character.personality).toContain('Любопытный');
      expect(payload.character.firstMessage).toContain('светлячками');
      expect(payload.character.avatarUrl).toMatch(
        new RegExp(`^/api/characters/${encodeURIComponent(payload.character.id)}/avatar\\?v=\\d+$`),
      );

      const avatarResponse = await app.inject({ method: 'GET', url: payload.character.avatarUrl ?? '' });
      expect(avatarResponse.statusCode).toBe(200);
      expect(avatarResponse.headers['content-type']).toBe('image/png');

      const listResponse = await app.inject({ method: 'GET', url: '/api/characters' });
      const listPayload = CharacterListResponseSchema.parse(listResponse.json());
      expect(listPayload.items.some((item) => item.id === payload.character.id)).toBe(true);
      expect(listPayload.items.filter((item) => item.name === 'Эмбер')).toHaveLength(1);

      await app.close();
    });

    it('stores the image of an imported card as a plain avatar without the card chunk', async () => {
      const cardChunkMarker = Buffer.from('tEXtchara', 'ascii');
      const png = buildPngWithCharaChunk(JSON.stringify({ name: 'Эмбер' }));
      expect(png.includes(cardChunkMarker)).toBe(true);

      const app = buildApiApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/characters/import',
        payload: { fileName: 'Ember.png', contentBase64: png.toString('base64') },
      });
      const payload = CharacterDetailResponseSchema.parse(response.json());
      expect(response.statusCode).toBe(201);

      const avatarResponse = await app.inject({ method: 'GET', url: payload.character.avatarUrl ?? '' });
      expect(avatarResponse.statusCode).toBe(200);
      expect(avatarResponse.rawPayload.includes(cardChunkMarker)).toBe(false);

      await app.close();
    });

    it('renames a character in its card without moving its file', async () => {
      const app = buildApiApp();
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/characters',
        payload: { name: 'Эля' },
      });
      const created = CharacterDetailResponseSchema.parse(createResponse.json()).character;

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/characters/${encodeURIComponent(created.id)}`,
        payload: { name: 'Эльвира' },
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(CharacterDetailResponseSchema.parse(updateResponse.json()).character.id).toBe(created.id);

      const listResponse = await app.inject({ method: 'GET', url: '/api/characters' });
      const listPayload = CharacterListResponseSchema.parse(listResponse.json());
      expect(listPayload.items.map((item) => [item.id, item.name])).toEqual([[created.id, 'Эльвира']]);

      await app.close();
    });

    it('rejects an upload that is not a PNG character card', async () => {
      const app = buildApiApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/characters/import',
        payload: {
          fileName: 'note.txt',
          contentBase64: Buffer.from('just a note').toString('base64'),
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'invalid_character_card' });
      await app.close();
    });

    it('migrates a legacy PNG card to a JSON card named from the card, not the file, and keeps the image as its avatar', async () => {
      const charactersDir = path.join(temporaryDataRoot, 'characters');
      await fs.mkdir(charactersDir, { recursive: true });
      const cardJson = {
        spec: 'chara_card_v2',
        data: {
          name: 'Мария Чернова',
          description: 'Художница из Петербурга, увлекается ботанической иллюстрацией.',
          personality: 'Тихая, наблюдательная, ироничная.',
          scenario: 'Мастерская в Гавани, поздний вечер.',
          first_mes: 'Привет. Чай завариваю — будешь?',
          mes_example: '<START>\n{{user}}: Что рисуешь?\n{{char}}: Папоротник.',
          system_prompt: 'Отвечай в стиле спокойного, тёплого диалога.',
          tags: ['ru', 'slice-of-life'],
        },
      };
      const png = buildPngWithCharaChunk(JSON.stringify(cardJson));
      await fs.writeFile(path.join(charactersDir, 'Лена.png'), png);

      const app = buildApiApp();
      const listResponse = await app.inject({ method: 'GET', url: '/api/characters' });
      const listPayload = CharacterListResponseSchema.parse(listResponse.json());

      expect(listPayload.items).toHaveLength(1);
      expect(listPayload.items[0]?.id).toBe('Лена.json');
      expect(listPayload.items[0]?.name).toBe('Мария Чернова');

      const detailResponse = await app.inject({
        method: 'GET',
        url: `/api/characters/${encodeURIComponent('Лена.json')}`,
      });
      const payload = CharacterDetailResponseSchema.parse(detailResponse.json());

      expect(detailResponse.statusCode).toBe(200);
      expect(payload.character.name).toBe('Мария Чернова');
      expect(payload.character.description).toContain('Художница');
      expect(payload.character.personality).toContain('наблюдательная');
      expect(payload.character.scenario).toContain('Гавани');
      expect(payload.character.firstMessage).toContain('Чай завариваю');
      expect(payload.character.exampleDialogue).toContain('Папоротник');
      expect(payload.character.systemPrompt).toContain('спокойного');
      expect(payload.character.tags).toEqual(['ru', 'slice-of-life']);

      const avatarResponse = await app.inject({ method: 'GET', url: payload.character.avatarUrl ?? '' });
      expect(avatarResponse.statusCode).toBe(200);
      expect(avatarResponse.headers['content-type']).toBe('image/png');

      await app.close();
    });

    it('dates a migrated legacy card by its image so it does not jump to the top of the list', async () => {
      const charactersDir = path.join(temporaryDataRoot, 'characters');
      await fs.mkdir(charactersDir, { recursive: true });
      const imagePath = path.join(charactersDir, 'Old.png');
      await fs.writeFile(imagePath, buildPngWithCharaChunk(JSON.stringify({ name: 'Старожил' })));
      const imageMtime = new Date('2001-02-03T04:05:06.000Z');
      await fs.utimes(imagePath, imageMtime, imageMtime);

      const app = buildApiApp();
      const listResponse = await app.inject({ method: 'GET', url: '/api/characters' });
      const listPayload = CharacterListResponseSchema.parse(listResponse.json());

      expect(listPayload.items).toHaveLength(1);
      expect(listPayload.items[0]?.updatedAt).toBe(imageMtime.toISOString());

      await app.close();
    });

    it('still resolves a character bound to a chat by its pre-migration image id', async () => {
      const charactersDir = path.join(temporaryDataRoot, 'characters');
      await fs.mkdir(charactersDir, { recursive: true });
      const png = buildPngWithCharaChunk(JSON.stringify({ name: 'Эмбер', description: 'Дракон.' }));
      await fs.writeFile(path.join(charactersDir, 'Ember.png'), png);

      const app = buildApiApp();
      await app.inject({ method: 'GET', url: '/api/characters' });

      const legacyResponse = await app.inject({ method: 'GET', url: '/api/characters/Ember.png' });
      const payload = CharacterDetailResponseSchema.parse(legacyResponse.json());

      expect(legacyResponse.statusCode).toBe(200);
      expect(payload.character.id).toBe('Ember.json');
      expect(payload.character.name).toBe('Эмбер');

      await app.close();
    });

    it('ignores a plain PNG that carries no character card', async () => {
      const charactersDir = path.join(temporaryDataRoot, 'characters');
      await fs.mkdir(charactersDir, { recursive: true });
      const png = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
        'hex',
      );
      await fs.writeFile(path.join(charactersDir, 'plain.png'), png);

      const app = buildApiApp();
      const listResponse = await app.inject({ method: 'GET', url: '/api/characters' });
      const listPayload = CharacterListResponseSchema.parse(listResponse.json());
      expect(listPayload.items).toHaveLength(0);

      const detailResponse = await app.inject({ method: 'GET', url: '/api/characters/plain.png' });
      expect(detailResponse.statusCode).toBe(404);

      await app.close();
    });

    it('saves an edited legacy card as JSON and leaves the image untouched', async () => {
      const charactersDir = path.join(temporaryDataRoot, 'characters');
      await fs.mkdir(charactersDir, { recursive: true });
      const cardJson = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
          name: 'Мария',
          description: 'старое описание',
          personality: 'старая личность',
          scenario: 'мастерская',
          first_mes: 'старая первая фраза',
        },
      };
      const png = buildPngWithCharaChunk(JSON.stringify(cardJson));
      await fs.writeFile(path.join(charactersDir, 'Мария Чернова.png'), png);

      const app = buildApiApp();
      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/characters/${encodeURIComponent('Мария Чернова.png')}`,
        payload: {
          name: 'Мария Чернова',
          description: 'обновлённое описание с {{user}} и {{char}}',
          personality: 'обновлённая личность',
          scenario: 'мастерская в Гавани, поздний вечер',
          firstMessage: 'Чай завариваю — будешь?',
          exampleDialogue: '<START>\n{{user}}: что?\n{{char}}: чай',
          systemPrompt: 'Reply in Russian.',
          tags: ['ru', 'slice-of-life'],
        },
      });
      const updatePayload = CharacterDetailResponseSchema.parse(updateResponse.json());

      expect(updateResponse.statusCode).toBe(200);
      expect(updatePayload.character.id).toBe('Мария Чернова.json');
      expect(updatePayload.character.description).toContain('обновлённое описание');
      expect(updatePayload.character.tags).toEqual(['ru', 'slice-of-life']);

      const detailResponse = await app.inject({
        method: 'GET',
        url: `/api/characters/${encodeURIComponent('Мария Чернова.json')}`,
      });
      const detailPayload = CharacterDetailResponseSchema.parse(detailResponse.json());
      expect(detailPayload.character.firstMessage).toBe('Чай завариваю — будешь?');
      expect(detailPayload.character.personality).toBe('обновлённая личность');

      const persisted = await fs.readFile(path.join(charactersDir, 'Мария Чернова.png'));
      expect(persisted.equals(png)).toBe(true);

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
