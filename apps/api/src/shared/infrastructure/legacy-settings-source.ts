import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import { readDataRoot } from '../../config/read-api-config.js';
import { createSerialQueue } from '../../platform/concurrency/serial-queue.js';
import { getSharedApiLogger } from '../../platform/logging/shared-api-logger.js';
import { writeJsonFileAtomically } from '../../platform/storage/atomic-file.js';

function readJsonObject(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  } catch (error) {
    getSharedApiLogger().warn({ err: error, filePath }, 'Malformed JSON in settings source; falling back to defaults');

    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    getSharedApiLogger().warn({ filePath }, 'Settings source is not a JSON object; falling back to defaults');

    return {};
  }

  return parsed as Record<string, unknown>;
}

function resolveLegacyUserSettingsPath() {
  return path.join(readDataRoot(), 'user-settings.json');
}

export function readLegacyUserSettingsSource() {
  return readJsonObject(resolveLegacyUserSettingsPath());
}

export type LegacyUserSettingsMutator = (
  current: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

const userSettingsWriteQueue = createSerialQueue();

export async function updateLegacyUserSettingsSource(mutate: LegacyUserSettingsMutator) {
  return userSettingsWriteQueue.run(async () => {
    const filePath = resolveLegacyUserSettingsPath();
    const next = await mutate(readJsonObject(filePath));

    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await writeJsonFileAtomically(filePath, next);

    return next;
  });
}

export function readLegacyAppSettingsSource() {
  return readJsonObject(path.join(readDataRoot(), 'settings.json'));
}
