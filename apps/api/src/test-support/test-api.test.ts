import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it, onTestFinished } from 'vitest';

import { findProjectRoot } from '../config/find-project-root.js';
import { readDataRoot } from '../config/read-api-config.js';
import { createTestApi } from './test-api.js';

const committedSmokeSettings = fileURLToPath(new URL('../../testdata/smoke-data/user-settings.json', import.meta.url));

function isInside(parent: string, child: string) {
  const relative = path.relative(fs.realpathSync(parent), fs.realpathSync(child));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

describe('createTestApi', () => {
  it('gives the test a temporary project with an empty data root inside it, away from the repository', async () => {
    const api = await createTestApi();

    expect(api.dataRoot).toBe(path.join(api.projectRoot, 'data'));
    expect(api.dependencies.config).toMatchObject({ dataRoot: api.dataRoot, projectRoot: api.projectRoot });
    expect(fs.readdirSync(api.dataRoot)).toEqual([]);
    expect(isInside(os.tmpdir(), api.projectRoot)).toBe(true);
    expect(isInside(findProjectRoot(import.meta.dirname), api.projectRoot)).toBe(false);
  });

  it('serves a copy of the smoke fixture, so a write never reaches the committed files', async () => {
    const committedBefore = fs.readFileSync(committedSmokeSettings, 'utf8');
    const api = await createTestApi({ fixture: 'smoke' });

    expect((await api.settings.read()).userName).toBe('Тестер');
    expect(fs.existsSync(path.join(api.dataRoot, 'models', 'nested', 'secondary.gguf'))).toBe(true);

    const response = await api.app.inject({
      method: 'PUT',
      url: '/api/settings/profile',
      payload: {
        messageFormatting: { actionsItalic: true, quotesHighlighted: false },
        responseLanguage: 'ru',
        streamingEnabled: true,
        systemPromptTemplate: '',
        thinkingEnabled: false,
        userName: 'Переименован',
        userPersona: '',
      },
    });

    expect(response.statusCode).toBe(200);
    expect((await api.settings.read()).userName).toBe('Переименован');
    expect(fs.readFileSync(committedSmokeSettings, 'utf8')).toBe(committedBefore);
  });

  it('points the data-root variable and the global fetch that unmigrated modules still read at the harness', async () => {
    const api = await createTestApi();

    expect(readDataRoot()).toBe(api.dataRoot);
    expect(globalThis.fetch).toBe(api.http.fetch);
    expect(api.dependencies.httpFetch).toBe(api.http.fetch);
    expect(api.dependencies.clock).toBe(api.clock);
    expect(api.dependencies.logger).toBe(api.logs.logger);
  });

  it('starts the clock the app reads where the options say', async () => {
    const api = await createTestApi({ clock: { start: new Date('2026-10-15T09:30:00.000Z'), stepMs: 0 } });

    expect(api.dependencies.clock.now().toISOString()).toBe('2026-10-15T09:30:00.000Z');
  });

  it('configures the app from the environment option, silent by default', async () => {
    const quiet = await createTestApi();
    const configured = await createTestApi({
      environment: { IMMERSION_LOG_LEVEL: 'warn', IMMERSION_WEB_PORT: '5173' },
    });

    expect(quiet.dependencies.config.logLevel).toBe('silent');
    expect(configured.dependencies.config).toMatchObject({ logLevel: 'warn', webPort: 5173 });
  });

  it('refuses an environment that names the data root, which the harness owns', async () => {
    await expect(createTestApi({ environment: { IMMERSION_DATA_ROOT: '/somewhere/else' } })).rejects.toThrow(
      'createTestApi owns IMMERSION_DATA_ROOT',
    );
  });

  it('closes the app and removes the temporary project once the test finishes', async () => {
    let projectRoot = '';
    let closed = false;
    onTestFinished(() => {
      expect(closed).toBe(true);
      expect(fs.existsSync(projectRoot)).toBe(false);
    });

    const api = await createTestApi();
    projectRoot = api.projectRoot;
    api.app.addHook('onClose', async () => {
      closed = true;
    });
    await api.app.ready();

    expect(fs.existsSync(projectRoot)).toBe(true);
  });
});
