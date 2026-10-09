import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { CharacterDetailResponseSchema, CharacterListResponseSchema } from '@immersion/contracts/characters';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

const PNG_BYTES = Buffer.concat([PNG_SIGNATURE, Buffer.from('avatar-pixels', 'utf8')]);
const JPEG_BYTES = Buffer.concat([JPEG_SIGNATURE, Buffer.from('jpeg-pixels', 'utf8')]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from('webp-pixels', 'utf8'),
]);

function buildPngChunk(type: string, data: Buffer): Buffer {
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

function buildPngWithCharaChunk(cardJson: string): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.writeUInt8(8, 8);
  const idatCompressed = zlib.deflateSync(Buffer.from([0x00, 0x00]));
  const cardBase64 = Buffer.from(cardJson, 'utf8').toString('base64');
  const tEXt = Buffer.concat([Buffer.from('chara', 'ascii'), Buffer.from([0x00]), Buffer.from(cardBase64, 'latin1')]);
  return Buffer.concat([
    PNG_SIGNATURE,
    buildPngChunk('IHDR', ihdr),
    buildPngChunk('tEXt', tEXt),
    buildPngChunk('IDAT', idatCompressed),
    buildPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('character avatar upload API', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-avatar-'));
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

  async function createJsonCharacter(app: ReturnType<typeof buildApiApp>, name = 'Тестовая героиня') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/characters',
      payload: { name },
    });
    expect(response.statusCode).toBe(201);
    return CharacterDetailResponseSchema.parse(response.json()).character;
  }

  function avatarUrlOf(characterId: string) {
    return `/api/characters/${encodeURIComponent(characterId)}/avatar`;
  }

  it('uploads a PNG avatar for a JSON character and serves it back with image/png', async () => {
    const app = buildApiApp();
    const character = await createJsonCharacter(app);
    expect(character.avatarUrl).toBeNull();

    const uploadResponse = await app.inject({
      method: 'PUT',
      url: avatarUrlOf(character.id),
      payload: { contentBase64: PNG_BYTES.toString('base64'), mimeType: 'image/png' },
    });
    expect(uploadResponse.statusCode).toBe(200);
    const uploadPayload = CharacterDetailResponseSchema.parse(uploadResponse.json());
    expect(uploadPayload.character.avatarUrl).toMatch(/\/avatar\?v=\d+$/);
    expect(uploadPayload.character.avatarUrl?.startsWith(`${avatarUrlOf(character.id)}?v=`)).toBe(true);

    const avatarResponse = await app.inject({ method: 'GET', url: avatarUrlOf(character.id) });
    expect(avatarResponse.statusCode).toBe(200);
    expect(avatarResponse.headers['content-type']).toBe('image/png');
    expect(avatarResponse.rawPayload.equals(PNG_BYTES)).toBe(true);

    await app.close();
  });

  it('replaces a previous avatar stored under a different extension', async () => {
    const app = buildApiApp();
    const character = await createJsonCharacter(app);

    const pngUpload = await app.inject({
      method: 'PUT',
      url: avatarUrlOf(character.id),
      payload: { contentBase64: PNG_BYTES.toString('base64'), mimeType: 'image/png' },
    });
    expect(pngUpload.statusCode).toBe(200);

    const webpUpload = await app.inject({
      method: 'PUT',
      url: avatarUrlOf(character.id),
      payload: { contentBase64: WEBP_BYTES.toString('base64'), mimeType: 'image/webp' },
    });
    expect(webpUpload.statusCode).toBe(200);

    const avatarResponse = await app.inject({ method: 'GET', url: avatarUrlOf(character.id) });
    expect(avatarResponse.statusCode).toBe(200);
    expect(avatarResponse.headers['content-type']).toBe('image/webp');

    const baseName = path.basename(character.id, '.json');
    const entries = await fs.readdir(path.join(temporaryDataRoot, 'characters'));
    expect(entries).toContain(`${baseName}.webp`);
    expect(entries).not.toContain(`${baseName}.png`);

    await app.close();
  });

  it('rejects an upload whose magic bytes do not match the declared mime type', async () => {
    const app = buildApiApp();
    const character = await createJsonCharacter(app);

    const response = await app.inject({
      method: 'PUT',
      url: avatarUrlOf(character.id),
      payload: { contentBase64: PNG_BYTES.toString('base64'), mimeType: 'image/jpeg' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'invalid_avatar_image' });

    const avatarResponse = await app.inject({ method: 'GET', url: avatarUrlOf(character.id) });
    expect(avatarResponse.statusCode).toBe(404);

    await app.close();
  });

  it('replaces the image of a migrated legacy card like any other avatar', async () => {
    const app = buildApiApp();
    const charactersDir = path.join(temporaryDataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.writeFile(
      path.join(charactersDir, 'card-hero.png'),
      buildPngWithCharaChunk(JSON.stringify({ name: 'Герой' })),
    );
    await app.inject({ method: 'GET', url: '/api/characters' });

    const response = await app.inject({
      method: 'PUT',
      url: avatarUrlOf('card-hero.json'),
      payload: { contentBase64: JPEG_BYTES.toString('base64'), mimeType: 'image/jpeg' },
    });
    expect(response.statusCode).toBe(200);

    const remaining = await fs.readdir(charactersDir);
    expect(remaining).toContain('card-hero.jpg');
    expect(remaining).not.toContain('card-hero.png');

    const deleteResponse = await app.inject({ method: 'DELETE', url: avatarUrlOf('card-hero.json') });
    expect(deleteResponse.statusCode).toBe(204);

    await app.close();
  });

  it('deletes an uploaded avatar and returns 404 afterwards', async () => {
    const app = buildApiApp();
    const character = await createJsonCharacter(app);

    await app.inject({
      method: 'PUT',
      url: avatarUrlOf(character.id),
      payload: { contentBase64: JPEG_BYTES.toString('base64'), mimeType: 'image/jpeg' },
    });

    const deleteResponse = await app.inject({ method: 'DELETE', url: avatarUrlOf(character.id) });
    expect(deleteResponse.statusCode).toBe(204);

    const avatarResponse = await app.inject({ method: 'GET', url: avatarUrlOf(character.id) });
    expect(avatarResponse.statusCode).toBe(404);
    expect(avatarResponse.json()).toMatchObject({ code: 'avatar_not_found' });

    const repeatedDelete = await app.inject({ method: 'DELETE', url: avatarUrlOf(character.id) });
    expect(repeatedDelete.statusCode).toBe(404);
    expect(repeatedDelete.json()).toMatchObject({ code: 'avatar_not_found' });

    await app.close();
  });

  it('changes the versioned avatar URL when the avatar is replaced', async () => {
    const app = buildApiApp();
    const character = await createJsonCharacter(app);

    const firstUpload = await app.inject({
      method: 'PUT',
      url: avatarUrlOf(character.id),
      payload: { contentBase64: PNG_BYTES.toString('base64'), mimeType: 'image/png' },
    });
    expect(firstUpload.statusCode).toBe(200);

    const baseName = path.basename(character.id, '.json');
    const avatarPath = path.join(temporaryDataRoot, 'characters', `${baseName}.png`);
    const mtimeBeforeAnyRewrite = new Date('2000-01-01T00:00:00.000Z');
    await fs.utimes(avatarPath, mtimeBeforeAnyRewrite, mtimeBeforeAnyRewrite);

    const staleDetail = await app.inject({ method: 'GET', url: `/api/characters/${encodeURIComponent(character.id)}` });
    const staleUrl = CharacterDetailResponseSchema.parse(staleDetail.json()).character.avatarUrl;
    expect(staleUrl).toMatch(/\?v=\d+$/);

    const secondUpload = await app.inject({
      method: 'PUT',
      url: avatarUrlOf(character.id),
      payload: { contentBase64: WEBP_BYTES.toString('base64'), mimeType: 'image/webp' },
    });
    expect(secondUpload.statusCode).toBe(200);
    const freshUrl = CharacterDetailResponseSchema.parse(secondUpload.json()).character.avatarUrl;

    expect(freshUrl).toMatch(/\?v=\d+$/);
    expect(freshUrl).not.toBe(staleUrl);

    await app.close();
  });

  it('treats an image next to a JSON card as its avatar even when the image carries a card of its own', async () => {
    const app = buildApiApp();
    const charactersDir = path.join(temporaryDataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    const cardPng = buildPngWithCharaChunk(JSON.stringify({ name: 'Соседка' }));
    await fs.writeFile(path.join(charactersDir, 'X.json'), JSON.stringify({ name: 'Хозяйка' }), 'utf8');
    await fs.writeFile(path.join(charactersDir, 'X.png'), cardPng);

    const listResponse = await app.inject({ method: 'GET', url: '/api/characters' });
    const items = CharacterListResponseSchema.parse(listResponse.json()).items;
    expect(items.map((item) => item.id)).toEqual(['X.json']);
    expect(items[0]?.name).toBe('Хозяйка');
    expect(items[0]?.avatarUrl).toMatch(/X\.json\/avatar\?v=\d+$/);

    const jpegUpload = await app.inject({
      method: 'PUT',
      url: avatarUrlOf('X.json'),
      payload: { contentBase64: JPEG_BYTES.toString('base64'), mimeType: 'image/jpeg' },
    });
    expect(jpegUpload.statusCode).toBe(200);
    const afterUpload = await fs.readdir(charactersDir);
    expect(afterUpload).toContain('X.jpg');
    expect(afterUpload).not.toContain('X.png');

    const deleteResponse = await app.inject({ method: 'DELETE', url: '/api/characters/X.json' });
    expect(deleteResponse.statusCode).toBe(204);
    const remaining = await fs.readdir(charactersDir);
    expect(remaining).not.toContain('X.json');
    expect(remaining).not.toContain('X.jpg');

    await app.close();
  });

  it('serves a stored avatar with the content type sniffed from its bytes, never from its file extension', async () => {
    const app = buildApiApp();
    const character = await createJsonCharacter(app);
    const baseName = path.basename(character.id, '.json');
    await fs.writeFile(path.join(temporaryDataRoot, 'characters', `${baseName}.png`), JPEG_BYTES);

    const avatarResponse = await app.inject({ method: 'GET', url: avatarUrlOf(character.id) });
    expect(avatarResponse.statusCode).toBe(200);
    expect(avatarResponse.headers['content-type']).toBe('image/jpeg');

    await app.close();
  });

  it('gives a new character an id that does not adopt an orphan image with the same base name', async () => {
    const app = buildApiApp();
    const charactersDir = path.join(temporaryDataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.writeFile(path.join(charactersDir, 'Орфей.webp'), WEBP_BYTES);

    const character = await createJsonCharacter(app, 'Орфей');
    expect(character.id).not.toBe('Орфей.json');
    expect(character.avatarUrl).toBeNull();

    await app.close();
  });

  it('rejects a traversal id on the avatar upload route without touching the file system', async () => {
    const app = buildApiApp();
    const settingsPath = path.join(temporaryDataRoot, 'user-settings.json');
    await fs.writeFile(settingsPath, JSON.stringify({ userName: 'Sentinel' }), 'utf8');

    const response = await app.inject({
      method: 'PUT',
      url: `/api/characters/${encodeURIComponent('../user-settings.json')}/avatar`,
      payload: { contentBase64: PNG_BYTES.toString('base64'), mimeType: 'image/png' },
    });
    expect([400, 404]).toContain(response.statusCode);
    await expect(fs.readFile(settingsPath, 'utf8')).resolves.toContain('Sentinel');

    await app.close();
  });
});
