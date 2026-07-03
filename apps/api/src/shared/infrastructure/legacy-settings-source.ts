import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import { writeJsonFileAtomically } from '../../lib/atomic-file.js';
import { resolveDataRoot } from '../../lib/data-root.js';
import { getSharedApiLogger } from '../../lib/logger.js';

function readJsonObject(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  } catch (error) {
    // A malformed settings file must degrade to defaults instead of failing every
    // read path (settings/runtime overviews, generation readiness).
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
  return path.join(resolveDataRoot(), 'user-settings.json');
}

export function readLegacyUserSettingsSource() {
  return readJsonObject(resolveLegacyUserSettingsPath());
}

export type LegacyUserSettingsMutator = (
  current: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

let userSettingsWriteQueue: Promise<unknown> = Promise.resolve();

/**
 * The single serialized read-modify-write path for user-settings.json. Every module
 * that persists into this file must go through this function so concurrent mutations
 * from different modules cannot drop each other's changes.
 */
export async function updateLegacyUserSettingsSource(mutate: LegacyUserSettingsMutator) {
  const operation = async () => {
    const filePath = resolveLegacyUserSettingsPath();
    const next = await mutate(readJsonObject(filePath));

    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await writeJsonFileAtomically(filePath, next);

    return next;
  };

  const run = userSettingsWriteQueue.catch(() => undefined).then(operation);

  userSettingsWriteQueue = run;

  return run;
}

export function readLegacyAppSettingsSource() {
  return readJsonObject(path.join(resolveDataRoot(), 'settings.json'));
}
