import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import type { SerialQueue } from '../../../platform/concurrency/serial-queue.js';
import type { LogPort } from '../../../platform/logging/log-port.js';
import { writeJsonFileAtomically } from '../../../platform/storage/atomic-file.js';
import type {
  UserSettingsDocument,
  UserSettingsMutator,
  UserSettingsRecord,
} from '../application/user-settings-document.js';

export interface UserSettingsFileOptions {
  readonly filePath: string;
  readonly logger: LogPort;
  readonly queue: SerialQueue;
}

export class UserSettingsFile implements UserSettingsDocument {
  private readonly filePath: string;
  private readonly logger: LogPort;
  private readonly queue: SerialQueue;

  constructor({ filePath, logger, queue }: UserSettingsFileOptions) {
    this.filePath = filePath;
    this.logger = logger;
    this.queue = queue;
  }

  read(): UserSettingsRecord {
    if (!fs.existsSync(this.filePath)) {
      return {};
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as unknown;
    } catch (error) {
      this.logger.warn(
        { err: error, filePath: this.filePath },
        'Malformed JSON in settings source; falling back to defaults',
      );

      return {};
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.logger.warn({ filePath: this.filePath }, 'Settings source is not a JSON object; falling back to defaults');

      return {};
    }

    return parsed as UserSettingsRecord;
  }

  update(mutate: UserSettingsMutator): Promise<UserSettingsRecord> {
    return this.queue.run(async () => {
      const next = await mutate(this.read());

      await fsPromises.mkdir(path.dirname(this.filePath), { recursive: true });
      await writeJsonFileAtomically(this.filePath, next);

      return next;
    });
  }
}
