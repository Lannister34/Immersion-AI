import fs from 'node:fs/promises';
import path from 'node:path';

import { CharacterDetailResponseSchema, CharacterListResponseSchema } from '@immersion/contracts/characters';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_MEGABYTES } from '@immersion/contracts/common';
import { describe, expect, it } from 'vitest';

import { buildCharacterCardPng } from './test-support/character-card-png.js';
import type { TestApi } from './test-support/test-api.js';
import { useTestApi } from './test-support/use-test-api.js';

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

describe('character avatar upload API', () => {
  const api = useTestApi();

  async function createJsonCharacter(app: TestApi['app'], name = 'Тестовая героиня') {
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
    const { app } = api();
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
  });

  it('replaces a previous avatar stored under a different extension', async () => {
    const { app, dataRoot } = api();
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
    const entries = await fs.readdir(path.join(dataRoot, 'characters'));
    expect(entries).toContain(`${baseName}.webp`);
    expect(entries).not.toContain(`${baseName}.png`);
  });

  it('rejects an upload whose magic bytes do not match the declared mime type', async () => {
    const { app } = api();
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
  });

  it('rejects an avatar one byte over the image upload limit with its size message', async () => {
    const { app } = api();
    const character = await createJsonCharacter(app);

    const response = await app.inject({
      method: 'PUT',
      url: avatarUrlOf(character.id),
      payload: { contentBase64: Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES + 1).toString('base64'), mimeType: 'image/png' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: 'invalid_avatar_image',
      message: `Файл аватара больше ${IMAGE_UPLOAD_MAX_MEGABYTES} МБ.`,
    });
  });

  it('replaces the image of a migrated legacy card like any other avatar', async () => {
    const { app, dataRoot } = api();
    const charactersDir = path.join(dataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.writeFile(path.join(charactersDir, 'card-hero.png'), buildCharacterCardPng({ name: 'Герой' }));
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
  });

  it('deletes an uploaded avatar and returns 404 afterwards', async () => {
    const { app } = api();
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
  });

  it('changes the versioned avatar URL when the avatar is replaced', async () => {
    const { app, dataRoot } = api();
    const character = await createJsonCharacter(app);

    const firstUpload = await app.inject({
      method: 'PUT',
      url: avatarUrlOf(character.id),
      payload: { contentBase64: PNG_BYTES.toString('base64'), mimeType: 'image/png' },
    });
    expect(firstUpload.statusCode).toBe(200);

    const baseName = path.basename(character.id, '.json');
    const avatarPath = path.join(dataRoot, 'characters', `${baseName}.png`);
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
  });

  it('treats an image next to a JSON card as its avatar even when the image carries a card of its own', async () => {
    const { app, dataRoot } = api();
    const charactersDir = path.join(dataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    const cardPng = buildCharacterCardPng({ name: 'Соседка' });
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
  });

  it('serves a stored avatar with the content type sniffed from its bytes, never from its file extension', async () => {
    const { app, dataRoot } = api();
    const character = await createJsonCharacter(app);
    const baseName = path.basename(character.id, '.json');
    await fs.writeFile(path.join(dataRoot, 'characters', `${baseName}.png`), JPEG_BYTES);

    const avatarResponse = await app.inject({ method: 'GET', url: avatarUrlOf(character.id) });
    expect(avatarResponse.statusCode).toBe(200);
    expect(avatarResponse.headers['content-type']).toBe('image/jpeg');
  });

  it('gives a new character an id that does not adopt an orphan image with the same base name', async () => {
    const { app, dataRoot } = api();
    const charactersDir = path.join(dataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.writeFile(path.join(charactersDir, 'Орфей.webp'), WEBP_BYTES);

    const character = await createJsonCharacter(app, 'Орфей');
    expect(character.id).not.toBe('Орфей.json');
    expect(character.avatarUrl).toBeNull();
  });
});
