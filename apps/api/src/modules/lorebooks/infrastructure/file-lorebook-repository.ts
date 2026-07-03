import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { LorebookDetailDto, LorebookEntryDto, LorebookSummaryDto } from '@immersion/contracts/lorebooks';

import { writeJsonFileAtomically } from '../../../lib/atomic-file.js';
import { resolveContainedFilePath } from '../../../lib/contained-path.js';
import { resolveDataRoot } from '../../../lib/data-root.js';

const LOREBOOKS_DIRECTORY = 'worlds';
const FILE_EXTENSION = '.json';

interface StoredLorebookEntry {
  content?: unknown;
  enabled?: unknown;
  key?: unknown;
  keys?: unknown;
  priority?: unknown;
}

interface StoredLorebook {
  createdAt?: unknown;
  entries?: unknown;
  name?: unknown;
  tags?: unknown;
  updatedAt?: unknown;
}

function resolveLorebooksDirectory() {
  return path.join(resolveDataRoot(), LOREBOOKS_DIRECTORY);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) items.push(entry.trim());
  }
  return items;
}

function countEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length;
  return 0;
}

export async function listLorebookFiles(): Promise<LorebookSummaryDto[]> {
  const directory = resolveLorebooksDirectory();
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') return [];
    throw error;
  }

  const summaries: LorebookSummaryDto[] = [];
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

    let parsed: StoredLorebook;
    try {
      parsed = JSON.parse(raw) as StoredLorebook;
    } catch {
      continue;
    }
    const name = asString(parsed.name) ?? path.basename(entry, path.extname(entry));
    summaries.push({
      entryCount: countEntries(parsed.entries),
      id: entry,
      name,
      tags: asStringArray(parsed.tags),
      updatedAt: stats.mtime.toISOString(),
    });
  }

  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sanitizeBaseName(name: string): string {
  const collapsed = name
    .trim()
    .replace(/[\\/:*?"<>|]+/gu, '_')
    .replace(/\s+/gu, '_')
    .replace(/\.{2,}/gu, '.')
    .replace(/^\.+/u, '');
  const trimmed = collapsed.length > 0 ? collapsed : 'lorebook';
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

function readEntries(stored: StoredLorebook): LorebookEntryDto[] {
  if (Array.isArray(stored.entries)) {
    return stored.entries.flatMap((entry) => entryFromStored(entry as StoredLorebookEntry));
  }
  if (stored.entries && typeof stored.entries === 'object') {
    return Object.values(stored.entries as Record<string, unknown>).flatMap((entry) =>
      entryFromStored(entry as StoredLorebookEntry),
    );
  }
  return [];
}

function entryFromStored(stored: StoredLorebookEntry | null | undefined): LorebookEntryDto[] {
  if (!stored || typeof stored !== 'object') return [];
  const keys = Array.isArray(stored.keys)
    ? stored.keys
    : Array.isArray(stored.key)
      ? stored.key
      : typeof stored.key === 'string'
        ? [stored.key]
        : [];
  const cleanKeys: string[] = [];
  for (const key of keys) {
    if (typeof key === 'string' && key.trim().length > 0) cleanKeys.push(key.trim());
  }
  const content = typeof stored.content === 'string' ? stored.content : '';
  const enabled = stored.enabled === false ? false : true;
  const priority =
    typeof stored.priority === 'number' && Number.isFinite(stored.priority) ? Math.trunc(stored.priority) : 0;
  return [
    {
      content,
      enabled,
      keys: cleanKeys,
      priority,
    },
  ];
}

function detailFromStored(id: string, stored: StoredLorebook, fallbackUpdatedAt: string): LorebookDetailDto {
  return {
    createdAt: asString(stored.createdAt),
    entries: readEntries(stored),
    id,
    name: asString(stored.name) ?? path.basename(id, path.extname(id)),
    tags: asStringArray(stored.tags),
    updatedAt: asString(stored.updatedAt) ?? fallbackUpdatedAt,
  };
}

function resolveLorebookFilePath(id: string) {
  return resolveContainedFilePath(resolveLorebooksDirectory(), id);
}

export async function readLorebookDetail(id: string): Promise<LorebookDetailDto | null> {
  const filePath = resolveLorebookFilePath(id);
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

  let parsed: StoredLorebook;
  try {
    parsed = JSON.parse(raw) as StoredLorebook;
  } catch {
    return null;
  }
  return detailFromStored(id, parsed, stats.mtime.toISOString());
}

export interface SaveLorebookFileInput {
  entries: LorebookEntryDto[];
  name: string;
  tags: string[];
}

export async function writeLorebookFile(id: string, input: SaveLorebookFileInput): Promise<LorebookDetailDto> {
  const directory = resolveLorebooksDirectory();
  await fs.mkdir(directory, { recursive: true });
  const filePath = resolveLorebookFilePath(id);

  let existing: StoredLorebook | null = null;
  try {
    existing = JSON.parse(await fs.readFile(filePath, 'utf8')) as StoredLorebook;
  } catch {
    existing = null;
  }
  const now = new Date().toISOString();
  const createdAt = existing && asString(existing.createdAt) ? asString(existing.createdAt) : now;

  const payload = {
    name: input.name,
    tags: input.tags,
    entries: input.entries,
    createdAt,
    updatedAt: now,
  };
  await writeJsonFileAtomically(filePath, payload);

  return {
    createdAt,
    entries: input.entries,
    id,
    name: input.name,
    tags: input.tags,
    updatedAt: now,
  };
}

export async function createLorebookFile(input: SaveLorebookFileInput): Promise<LorebookDetailDto> {
  const directory = resolveLorebooksDirectory();
  await fs.mkdir(directory, { recursive: true });
  const base = sanitizeBaseName(input.name);
  const id = await generateUniqueId(directory, base);
  return writeLorebookFile(id, input);
}

export async function deleteLorebookFile(id: string): Promise<boolean> {
  const filePath = resolveLorebookFilePath(id);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') return false;
    throw error;
  }
}
