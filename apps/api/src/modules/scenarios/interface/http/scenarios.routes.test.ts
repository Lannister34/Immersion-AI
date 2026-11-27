import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type ScenarioDetailDto,
  ScenarioDetailResponseSchema,
  ScenarioListResponseSchema,
} from '@immersion/contracts/scenarios';
import { describe, expect, it } from 'vitest';

import { useTestApi } from '../../../../test-support/use-test-api.js';

const EMOJI = '\u{1F409}';

describe('scenario routes: file names as ids', () => {
  const api = useTestApi();

  const scenarioUrl = (id: string): string => `/api/scenarios/${encodeURIComponent(id)}`;
  const scenariosDirectory = (): string => path.join(api().dataRoot, 'scenarios');

  async function createScenario(name: string): Promise<ScenarioDetailDto> {
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/scenarios',
      payload: { concept: '', content: `Текст: ${name}`, name, tags: [] },
    });
    expect(response.statusCode).toBe(201);
    return ScenarioDetailResponseSchema.parse(response.json()).scenario;
  }

  async function listedIds(): Promise<string[]> {
    const response = await api().app.inject({ method: 'GET', url: '/api/scenarios' });
    expect(response.statusCode).toBe(200);
    return ScenarioListResponseSchema.parse(response.json()).items.map((item) => item.id);
  }

  async function readScenario(id: string): Promise<ScenarioDetailDto> {
    const response = await api().app.inject({ method: 'GET', url: scenarioUrl(id) });
    expect(response.statusCode).toBe(200);
    return ScenarioDetailResponseSchema.parse(response.json()).scenario;
  }

  async function writeScenarioFile(fileName: string, name: string): Promise<void> {
    await fs.mkdir(scenariosDirectory(), { recursive: true });
    await fs.writeFile(path.join(scenariosDirectory(), fileName), JSON.stringify({ content: '', name }), 'utf8');
  }

  it('a name ending in a dot round-trips through create, list, get and delete', async () => {
    const created = await createScenario('Mr.');

    expect(created.id).toBe('Mr.json');
    expect(await listedIds()).toEqual(['Mr.json']);
    expect(await readScenario(created.id)).toMatchObject({ name: 'Mr.' });
    expect((await api().app.inject({ method: 'DELETE', url: scenarioUrl(created.id) })).statusCode).toBe(204);
    expect(await listedIds()).toEqual([]);
  });

  it('a file already named Mr..json on disk is listed, opened and deleted', async () => {
    await writeScenarioFile('Mr..json', 'Mr.');

    expect(await listedIds()).toEqual(['Mr..json']);
    expect(await readScenario('Mr..json')).toMatchObject({ name: 'Mr.' });
    expect((await api().app.inject({ method: 'DELETE', url: scenarioUrl('Mr..json') })).statusCode).toBe(204);
    expect(await fs.readdir(scenariosDirectory())).toEqual([]);
  });

  it('a file whose name is exactly 200 characters is listed, opened, saved and deleted', async () => {
    const id = `${'a'.repeat(195)}.json`;
    await writeScenarioFile(id, 'На пределе');

    expect(await listedIds()).toEqual([id]);
    expect(await readScenario(id)).toMatchObject({ name: 'На пределе' });
    const saved = await api().app.inject({
      method: 'PUT',
      url: scenarioUrl(id),
      payload: { concept: '', content: 'Сохранено', name: 'На пределе', tags: [] },
    });
    expect(saved.statusCode).toBe(200);
    expect((await api().app.inject({ method: 'DELETE', url: scenarioUrl(id) })).statusCode).toBe(204);
  });

  it('a file whose name is longer than 200 characters is skipped and warned once across two lists', async () => {
    const longName = `${'a'.repeat(196)}.json`;
    await writeScenarioFile(longName, 'Длинное имя');
    await writeScenarioFile('Обычный.json', 'Обычный');

    expect(await listedIds()).toEqual(['Обычный.json']);
    expect(await listedIds()).toEqual(['Обычный.json']);
    expect(api().logs.lines.filter((line) => line.level === 'warn')).toEqual([
      expect.objectContaining({ fileName: longName }),
    ]);
  });

  it('a hidden file is skipped without a warning', async () => {
    await writeScenarioFile('.hidden.json', 'Скрытый');

    expect(await listedIds()).toEqual([]);
    expect(api().logs.lines.filter((line) => line.level === 'warn')).toEqual([]);
  });

  it('two names that differ only in letter case never overwrite each other', async () => {
    const upper = await createScenario('Mr.');
    const lower = await createScenario('mr.');

    expect(lower.id).not.toBe(upper.id);
    expect(await readScenario(upper.id)).toMatchObject({ content: 'Текст: Mr.', name: 'Mr.' });
    expect(await readScenario(lower.id)).toMatchObject({ content: 'Текст: mr.', name: 'mr.' });
  });

  it('a Windows device name gets a prefix, so the file is never the device', async () => {
    const device = await createScenario('CON');
    const deviceWithExtension = await createScenario('con.v2');

    expect(device.id).toBe('_CON.json');
    expect(deviceWithExtension.id).toBe('_con.v2.json');
    expect(await readScenario(device.id)).toMatchObject({ name: 'CON' });
  });

  it('a name of four-byte characters is cut to fit the file system and round-trips', async () => {
    const created = await createScenario(EMOJI.repeat(90));

    expect(created.id).toBe(`${EMOJI.repeat(50)}.json`);
    expect(await readScenario(created.id)).toMatchObject({ name: EMOJI.repeat(90) });
  });
});
