import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CharacterDetailResponseSchema } from '@immersion/contracts/characters';

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
    expect(uploadPayload.character.avatarUrl).toBe(avatarUrlOf(character.id));

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

  it('rejects an avatar upload for a PNG-card character with avatar_owned_by_card', async () => {
    const app = buildApiApp();
    const charactersDir = path.join(temporaryDataRoot, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });
    await fs.writeFile(path.join(charactersDir, 'card-hero.png'), PNG_BYTES);

    const response = await app.inject({
      method: 'PUT',
      url: avatarUrlOf('card-hero.png'),
      payload: { contentBase64: JPEG_BYTES.toString('base64'), mimeType: 'image/jpeg' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'avatar_owned_by_card' });

    const deleteResponse = await app.inject({ method: 'DELETE', url: avatarUrlOf('card-hero.png') });
    expect(deleteResponse.statusCode).toBe(409);

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
