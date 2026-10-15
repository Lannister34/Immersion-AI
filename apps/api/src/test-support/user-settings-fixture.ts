import fs from 'node:fs/promises';
import path from 'node:path';

import { isErrnoCode } from '../platform/errno-code.js';
import {
  type StoredUserSettingsFixture,
  StoredUserSettingsFixtureSchema,
} from './stored-user-settings-fixture-schema.js';

export interface ExternalProviderFixture {
  readonly url: string;
  readonly model?: string;
  readonly apiKey?: string;
}

export interface UserSettingsFixtureFile {
  readonly path: string;
  read(): Promise<StoredUserSettingsFixture>;
  write(settings: StoredUserSettingsFixture): Promise<void>;
  patch(changes: StoredUserSettingsFixture): Promise<StoredUserSettingsFixture>;
  useExternalProvider(provider: ExternalProviderFixture): Promise<StoredUserSettingsFixture>;
}

export function createUserSettingsFixtureFile(dataRoot: string): UserSettingsFixtureFile {
  const filePath = path.join(dataRoot, 'user-settings.json');

  async function read(): Promise<StoredUserSettingsFixture> {
    return StoredUserSettingsFixtureSchema.parse(JSON.parse(await fs.readFile(filePath, 'utf8')));
  }

  async function readOrEmpty(): Promise<StoredUserSettingsFixture> {
    try {
      return await read();
    } catch (error) {
      if (isErrnoCode(error, 'ENOENT')) {
        return {};
      }

      throw error;
    }
  }

  async function write(settings: StoredUserSettingsFixture): Promise<void> {
    await fs.mkdir(dataRoot, { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  }

  async function patch(changes: StoredUserSettingsFixture): Promise<StoredUserSettingsFixture> {
    const current = await readOrEmpty();
    const next: StoredUserSettingsFixture = { ...current, ...changes };

    if (current.providerConfigs !== undefined && changes.providerConfigs !== undefined) {
      next.providerConfigs = { ...current.providerConfigs, ...changes.providerConfigs };
    }

    await write(next);

    return next;
  }

  return {
    path: filePath,
    read,
    write,
    patch,
    useExternalProvider({ url, model = 'smoke-model', apiKey = 'secret-token' }) {
      return patch({
        backendMode: 'external',
        activeProvider: 'custom',
        providerConfigs: { custom: { url, model, apiKey } },
      });
    },
  };
}
