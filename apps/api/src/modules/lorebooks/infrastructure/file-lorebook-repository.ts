import fs from 'node:fs/promises';
import path from 'node:path';

import type { LorebookSummaryDto } from '@immersion/contracts/lorebooks';

import { resolveDataRoot } from '../../../lib/data-root.js';

const LOREBOOKS_DIRECTORY = 'worlds';

interface StoredLorebook {
  entries?: unknown;
  name?: unknown;
  tags?: unknown;
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
