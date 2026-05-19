import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import { resolveDataRoot } from '../../lib/data-root.js';

function readJsonObject(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }

  return parsed as Record<string, unknown>;
}

async function writeJsonObjectAtomically(filePath: string, payload: Record<string, unknown>) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fsPromises.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await fsPromises.rename(tempPath, filePath);
  } catch (error) {
    await fsPromises.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function resolveLegacyUserSettingsPath() {
  return path.join(resolveDataRoot(), 'user-settings.json');
}

export function readLegacyUserSettingsSource() {
  return readJsonObject(resolveLegacyUserSettingsPath());
}

export async function writeLegacyUserSettingsSource(next: Record<string, unknown>) {
  await writeJsonObjectAtomically(resolveLegacyUserSettingsPath(), next);
}

export function readLegacyAppSettingsSource() {
  return readJsonObject(path.join(resolveDataRoot(), 'settings.json'));
}
