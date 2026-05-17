import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ScenarioDetailDto, ScenarioSummaryDto } from '@immersion/contracts/scenarios';

import { resolveDataRoot } from '../../../lib/data-root.js';

const SCENARIOS_DIRECTORY = 'scenarios';
const FILE_EXTENSION = '.json';

interface StoredScenario {
  concept?: unknown;
  content?: unknown;
  createdAt?: unknown;
  name?: unknown;
  tags?: unknown;
  updatedAt?: unknown;
}

function resolveScenariosDirectory() {
  return path.join(resolveDataRoot(), SCENARIOS_DIRECTORY);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      items.push(entry.trim());
    }
  }
  return items;
}

function summaryFromStored(id: string, stored: StoredScenario, fallbackUpdatedAt: string): ScenarioSummaryDto {
  const name = asString(stored.name) ?? path.basename(id, path.extname(id));
  const concept = asString(stored.concept);
  const content = asString(stored.content);
  const preview = concept ?? (content ? content.slice(0, 240) : null);

  return {
    concept,
    createdAt: asString(stored.createdAt),
    id,
    name,
    preview,
    tags: asStringArray(stored.tags),
    updatedAt: asString(stored.updatedAt) ?? fallbackUpdatedAt,
  };
}

function sanitizeBaseName(name: string): string {
  const collapsed = name
    .trim()
    .replace(/[\\/:*?"<>|]+/gu, '_')
    .replace(/\s+/gu, '_');
  const trimmed = collapsed.length > 0 ? collapsed : 'scenario';
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed;
}

async function generateUniqueId(directory: string, base: string): Promise<string> {
  const baseId = `${base}${FILE_EXTENSION}`;
  try {
    await fs.access(path.join(directory, baseId));
  } catch {
    return baseId;
  }
  const suffix = randomUUID().slice(0, 8);
  return `${base}-${suffix}${FILE_EXTENSION}`;
}

async function writeJsonAtomic(filePath: string, payload: unknown) {
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function listScenarioFiles(): Promise<ScenarioSummaryDto[]> {
  const directory = resolveScenariosDirectory();
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const summaries: ScenarioSummaryDto[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.json')) continue;
    const filePath = path.join(directory, entry);
    let raw: string;
    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      [raw, stats] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;

    let parsed: StoredScenario;
    try {
      parsed = JSON.parse(raw) as StoredScenario;
    } catch {
      continue;
    }
    summaries.push(summaryFromStored(entry, parsed, stats.mtime.toISOString()));
  }

  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function detailFromStored(id: string, stored: StoredScenario, fallbackUpdatedAt: string): ScenarioDetailDto {
  return {
    concept: asString(stored.concept) ?? '',
    content: asString(stored.content) ?? '',
    createdAt: asString(stored.createdAt),
    id,
    name: asString(stored.name) ?? path.basename(id, path.extname(id)),
    tags: asStringArray(stored.tags),
    updatedAt: asString(stored.updatedAt) ?? fallbackUpdatedAt,
  };
}

export async function readScenarioDetail(id: string): Promise<ScenarioDetailDto | null> {
  const filePath = path.join(resolveScenariosDirectory(), id);
  let raw: string;
  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    [raw, stats] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') return null;
    throw error;
  }
  if (!stats.isFile()) return null;

  let parsed: StoredScenario;
  try {
    parsed = JSON.parse(raw) as StoredScenario;
  } catch {
    return null;
  }
  return detailFromStored(id, parsed, stats.mtime.toISOString());
}

export interface SaveScenarioFileInput {
  concept: string;
  content: string;
  name: string;
  tags: string[];
}

export async function writeScenarioFile(id: string, input: SaveScenarioFileInput): Promise<ScenarioDetailDto> {
  const directory = resolveScenariosDirectory();
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, id);

  let existing: StoredScenario | null = null;
  try {
    existing = JSON.parse(await fs.readFile(filePath, 'utf8')) as StoredScenario;
  } catch {
    existing = null;
  }
  const now = new Date().toISOString();
  const createdAt = existing && asString(existing.createdAt) ? asString(existing.createdAt) : now;

  const payload = {
    name: input.name,
    content: input.content,
    concept: input.concept,
    tags: input.tags,
    createdAt,
    updatedAt: now,
  };
  await writeJsonAtomic(filePath, payload);

  return {
    concept: input.concept,
    content: input.content,
    createdAt,
    id,
    name: input.name,
    tags: input.tags,
    updatedAt: now,
  };
}

export async function createScenarioFile(input: SaveScenarioFileInput): Promise<ScenarioDetailDto> {
  const directory = resolveScenariosDirectory();
  await fs.mkdir(directory, { recursive: true });
  const base = sanitizeBaseName(input.name);
  const id = await generateUniqueId(directory, base);
  return writeScenarioFile(id, input);
}

export async function deleteScenarioFile(id: string): Promise<boolean> {
  const filePath = path.join(resolveScenariosDirectory(), id);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') return false;
    throw error;
  }
}
