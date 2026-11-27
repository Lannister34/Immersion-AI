import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type LorebookDetailDto,
  LorebookDetailResponseSchema,
  LorebookListResponseSchema,
} from '@immersion/contracts/lorebooks';
import { describe, expect, it } from 'vitest';

import { useTestApi } from '../../../../test-support/use-test-api.js';

const EMOJI = '\u{1F409}';

describe('lorebook routes: file names as ids', () => {
  const api = useTestApi();

  const lorebookUrl = (id: string): string => `/api/lorebooks/${encodeURIComponent(id)}`;
  const lorebooksDirectory = (): string => path.join(api().dataRoot, 'worlds');

  async function createLorebook(name: string): Promise<LorebookDetailDto> {
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/lorebooks',
      payload: { entries: [{ content: `Текст: ${name}` }], name, tags: [] },
    });
    expect(response.statusCode).toBe(201);
    return LorebookDetailResponseSchema.parse(response.json()).lorebook;
  }

  async function listedIds(): Promise<string[]> {
    const response = await api().app.inject({ method: 'GET', url: '/api/lorebooks' });
    expect(response.statusCode).toBe(200);
    return LorebookListResponseSchema.parse(response.json()).items.map((item) => item.id);
  }

  async function readLorebook(id: string): Promise<LorebookDetailDto> {
    const response = await api().app.inject({ method: 'GET', url: lorebookUrl(id) });
    expect(response.statusCode).toBe(200);
    return LorebookDetailResponseSchema.parse(response.json()).lorebook;
  }

  async function writeLorebookFile(fileName: string, name: string): Promise<void> {
    await fs.mkdir(lorebooksDirectory(), { recursive: true });
    await fs.writeFile(path.join(lorebooksDirectory(), fileName), JSON.stringify({ entries: [], name }), 'utf8');
  }

  it('a name ending in a dot round-trips through create, list, get and delete', async () => {
    const created = await createLorebook('Mr.');

    expect(created.id).toBe('Mr.json');
    expect(await listedIds()).toEqual(['Mr.json']);
    expect(await readLorebook(created.id)).toMatchObject({ name: 'Mr.' });
    expect((await api().app.inject({ method: 'DELETE', url: lorebookUrl(created.id) })).statusCode).toBe(204);
    expect(await listedIds()).toEqual([]);
  });

  it('a file already named Mr..json on disk is listed, opened and deleted', async () => {
    await writeLorebookFile('Mr..json', 'Mr.');

    expect(await listedIds()).toEqual(['Mr..json']);
    expect(await readLorebook('Mr..json')).toMatchObject({ name: 'Mr.' });
    expect((await api().app.inject({ method: 'DELETE', url: lorebookUrl('Mr..json') })).statusCode).toBe(204);
    expect(await fs.readdir(lorebooksDirectory())).toEqual([]);
  });

  it('a file whose name is exactly 200 characters is listed, opened, saved and deleted', async () => {
    const id = `${'a'.repeat(195)}.json`;
    await writeLorebookFile(id, 'На пределе');

    expect(await listedIds()).toEqual([id]);
    expect(await readLorebook(id)).toMatchObject({ name: 'На пределе' });
    const saved = await api().app.inject({
      method: 'PUT',
      url: lorebookUrl(id),
      payload: { entries: [], name: 'На пределе', tags: [] },
    });
    expect(saved.statusCode).toBe(200);
    expect((await api().app.inject({ method: 'DELETE', url: lorebookUrl(id) })).statusCode).toBe(204);
  });

  it('a file whose name is longer than 200 characters is skipped and warned once across two lists', async () => {
    const longName = `${'a'.repeat(196)}.json`;
    await writeLorebookFile(longName, 'Длинное имя');
    await writeLorebookFile('Обычный.json', 'Обычный');

    expect(await listedIds()).toEqual(['Обычный.json']);
    expect(await listedIds()).toEqual(['Обычный.json']);
    expect(api().logs.lines.filter((line) => line.level === 'warn')).toEqual([
      expect.objectContaining({ fileName: longName }),
    ]);
  });

  it('a hidden file is skipped without a warning', async () => {
    await writeLorebookFile('.hidden.json', 'Скрытый');

    expect(await listedIds()).toEqual([]);
    expect(api().logs.lines.filter((line) => line.level === 'warn')).toEqual([]);
  });

  it('two names that differ only in letter case never overwrite each other', async () => {
    const upper = await createLorebook('Mr.');
    const lower = await createLorebook('mr.');

    expect(lower.id).not.toBe(upper.id);
    expect(await readLorebook(upper.id)).toMatchObject({ entries: [{ content: 'Текст: Mr.' }], name: 'Mr.' });
    expect(await readLorebook(lower.id)).toMatchObject({ entries: [{ content: 'Текст: mr.' }], name: 'mr.' });
  });

  it('a Windows device name gets a prefix, so the file is never the device', async () => {
    const device = await createLorebook('CON');
    const deviceWithExtension = await createLorebook('con.v2');

    expect(device.id).toBe('_CON.json');
    expect(deviceWithExtension.id).toBe('_con.v2.json');
    expect(await readLorebook(device.id)).toMatchObject({ name: 'CON' });
  });

  it('a name of four-byte characters is cut to fit the file system and round-trips', async () => {
    const created = await createLorebook(EMOJI.repeat(90));

    expect(created.id).toBe(`${EMOJI.repeat(50)}.json`);
    expect(await readLorebook(created.id)).toMatchObject({ name: EMOJI.repeat(90) });
  });
});
