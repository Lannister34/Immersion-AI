import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type CharacterDetailDto,
  CharacterDetailResponseSchema,
  CharacterListResponseSchema,
} from '@immersion/contracts/characters';
import { describe, expect, it } from 'vitest';

import { buildCharacterCardPng } from '../../../../test-support/character-card-png.js';
import { useTestApi } from '../../../../test-support/use-test-api.js';

const EMOJI = '\u{1F409}';

describe('character routes: file names as ids', () => {
  const api = useTestApi();

  const characterUrl = (id: string): string => `/api/characters/${encodeURIComponent(id)}`;
  const charactersDirectory = (): string => path.join(api().dataRoot, 'characters');

  async function createCharacter(name: string): Promise<CharacterDetailDto> {
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/characters',
      payload: { description: `Текст: ${name}`, name },
    });
    expect(response.statusCode).toBe(201);
    return CharacterDetailResponseSchema.parse(response.json()).character;
  }

  async function listedIds(): Promise<string[]> {
    const response = await api().app.inject({ method: 'GET', url: '/api/characters' });
    expect(response.statusCode).toBe(200);
    return CharacterListResponseSchema.parse(response.json()).items.map((item) => item.id);
  }

  async function readCharacter(id: string): Promise<CharacterDetailDto> {
    const response = await api().app.inject({ method: 'GET', url: characterUrl(id) });
    expect(response.statusCode).toBe(200);
    return CharacterDetailResponseSchema.parse(response.json()).character;
  }

  async function writeCharacterFile(fileName: string, name: string): Promise<void> {
    await fs.mkdir(charactersDirectory(), { recursive: true });
    await fs.writeFile(path.join(charactersDirectory(), fileName), JSON.stringify({ name }), 'utf8');
  }

  it('a name ending in a dot round-trips through create, list, get and delete', async () => {
    const created = await createCharacter('Mr.');

    expect(created.id).toBe('Mr.json');
    expect(await listedIds()).toEqual(['Mr.json']);
    expect(await readCharacter(created.id)).toMatchObject({ name: 'Mr.' });
    expect((await api().app.inject({ method: 'DELETE', url: characterUrl(created.id) })).statusCode).toBe(204);
    expect(await listedIds()).toEqual([]);
  });

  it('a file already named Mr..json on disk is listed, opened and deleted', async () => {
    await writeCharacterFile('Mr..json', 'Mr.');

    expect(await listedIds()).toEqual(['Mr..json']);
    expect(await readCharacter('Mr..json')).toMatchObject({ name: 'Mr.' });
    expect((await api().app.inject({ method: 'DELETE', url: characterUrl('Mr..json') })).statusCode).toBe(204);
    expect(await fs.readdir(charactersDirectory())).toEqual([]);
  });

  it('a file whose name is exactly 200 characters is listed, opened, saved and deleted', async () => {
    const id = `${'a'.repeat(195)}.json`;
    await writeCharacterFile(id, 'На пределе');

    expect(await listedIds()).toEqual([id]);
    expect(await readCharacter(id)).toMatchObject({ name: 'На пределе' });
    const saved = await api().app.inject({
      method: 'PUT',
      url: characterUrl(id),
      payload: { name: 'На пределе' },
    });
    expect(saved.statusCode).toBe(200);
    expect((await api().app.inject({ method: 'DELETE', url: characterUrl(id) })).statusCode).toBe(204);
  });

  it('a file whose name is longer than 200 characters is skipped and warned once across two lists', async () => {
    const longName = `${'a'.repeat(196)}.json`;
    await writeCharacterFile(longName, 'Длинное имя');
    await writeCharacterFile('Обычный.json', 'Обычный');

    expect(await listedIds()).toEqual(['Обычный.json']);
    expect(await listedIds()).toEqual(['Обычный.json']);
    expect(api().logs.lines.filter((line) => line.level === 'warn')).toEqual([
      expect.objectContaining({ fileName: longName }),
    ]);
  });

  it('a hidden file is skipped without a warning', async () => {
    await writeCharacterFile('.hidden.json', 'Скрытый');

    expect(await listedIds()).toEqual([]);
    expect(api().logs.lines.filter((line) => line.level === 'warn')).toEqual([]);
  });

  it('two names that differ only in letter case never overwrite each other', async () => {
    const upper = await createCharacter('Mr.');
    const lower = await createCharacter('mr.');

    expect(lower.id).not.toBe(upper.id);
    expect(await readCharacter(upper.id)).toMatchObject({ description: 'Текст: Mr.', name: 'Mr.' });
    expect(await readCharacter(lower.id)).toMatchObject({ description: 'Текст: mr.', name: 'mr.' });
  });

  it('a Windows device name gets a prefix, so the file is never the device', async () => {
    const device = await createCharacter('CON');
    const deviceWithExtension = await createCharacter('con.v2');

    expect(device.id).toBe('_CON.json');
    expect(deviceWithExtension.id).toBe('_con.v2.json');
    expect(await readCharacter(device.id)).toMatchObject({ name: 'CON' });
  });

  it('a name of four-byte characters is cut to fit the file system and round-trips', async () => {
    const created = await createCharacter(EMOJI.repeat(90));

    expect(created.id).toBe(`${EMOJI.repeat(50)}.json`);
    expect(await readCharacter(created.id)).toMatchObject({ name: EMOJI.repeat(90) });
  });

  it('a legacy PNG whose card id would exceed 200 characters is skipped and the list loads', async () => {
    const longImage = `${'a'.repeat(197)}.png`;
    await fs.mkdir(charactersDirectory(), { recursive: true });
    await fs.writeFile(
      path.join(charactersDirectory(), longImage),
      buildCharacterCardPng({ data: { name: 'Длинная карточка' }, spec: 'chara_card_v2' }),
    );
    await writeCharacterFile('Обычный.json', 'Обычный');

    expect(await listedIds()).toEqual(['Обычный.json']);
    expect(await listedIds()).toEqual(['Обычный.json']);
    expect(await fs.readdir(charactersDirectory())).toEqual(expect.arrayContaining([longImage, 'Обычный.json']));
    expect(await fs.readdir(charactersDirectory())).toHaveLength(2);
    expect(api().logs.lines.filter((line) => line.level === 'warn')).toEqual([
      expect.objectContaining({ fileName: longImage }),
    ]);
  });
});
