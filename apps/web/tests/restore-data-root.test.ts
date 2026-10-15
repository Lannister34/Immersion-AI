import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { directorySnapshot } from './directory-snapshot.js';
import { restoreDataRoot } from './restore-data-root.js';

describe('restoreDataRoot', () => {
  let sandbox = '';
  let fixture = '';
  let root = '';

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'immersion-web-restore-test-'));
    fixture = path.join(sandbox, 'fixture');
    root = path.join(sandbox, 'root');
    fs.mkdirSync(path.join(fixture, 'models', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'user-settings.json'), '{"persona":{"name":"Тестер"}}');
    fs.writeFileSync(path.join(fixture, 'settings.json'), '{}');
    fs.writeFileSync(path.join(fixture, 'models', 'nested', 'модель.gguf'), 'weights');
    fs.cpSync(fixture, root, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(sandbox, { force: true, recursive: true });
  });

  it('brings every store back to the fixture: edited, added and deleted entries alike', async () => {
    fs.writeFileSync(path.join(root, 'user-settings.json'), '{"persona":{"name":"Другой"}}');
    fs.rmSync(path.join(root, 'models', 'nested'), { recursive: true });
    for (const store of ['characters', 'worlds', 'scenarios', path.join('chats', '_no_character_')]) {
      fs.mkdirSync(path.join(root, store), { recursive: true });
      fs.writeFileSync(path.join(root, store, 'смоук.json'), '{}');
    }
    fs.writeFileSync(path.join(root, '.llm-server.json'), '{"pid":1}');

    await restoreDataRoot(root, fixture);

    expect(directorySnapshot(root)).toEqual(directorySnapshot(fixture));
  });

  it('keeps the root directory itself, which the API server keeps serving', async () => {
    const before = fs.statSync(root).ino;

    await restoreDataRoot(root, fixture);

    expect(fs.statSync(root).ino).toBe(before);
  });

  it('leaves the fixture untouched', async () => {
    const fixtureBefore = directorySnapshot(fixture);
    fs.writeFileSync(path.join(root, 'user-settings.json'), '{}');

    await restoreDataRoot(root, fixture);

    expect(directorySnapshot(fixture)).toEqual(fixtureBefore);
  });
});
