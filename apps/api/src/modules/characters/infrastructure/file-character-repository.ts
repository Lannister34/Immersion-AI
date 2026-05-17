import fs from 'node:fs/promises';
import path from 'node:path';

import type { CharacterSourceFormat, CharacterSummaryDto } from '@immersion/contracts/characters';

import { resolveDataRoot } from '../../../lib/data-root.js';

const CHARACTERS_DIRECTORY = 'characters';

export interface CharacterFileSummary extends CharacterSummaryDto {
  filePath: string;
}

function resolveCharactersDirectory() {
  return path.join(resolveDataRoot(), CHARACTERS_DIRECTORY);
}

function characterFormatOf(entry: string): CharacterSourceFormat | null {
  const lower = entry.toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.json')) return 'json';
  return null;
}

export async function listCharacterFiles(): Promise<CharacterFileSummary[]> {
  const directory = resolveCharactersDirectory();
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

  const summaries: CharacterFileSummary[] = [];
  for (const entry of entries) {
    const source = characterFormatOf(entry);
    if (!source) continue;

    const filePath = path.join(directory, entry);
    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(filePath);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;

    const id = entry;
    const name = path.basename(entry, path.extname(entry));
    summaries.push({
      avatarUrl: source === 'png' ? `/api/characters/${encodeURIComponent(id)}/avatar` : null,
      filePath,
      id,
      name,
      source,
      updatedAt: stats.mtime.toISOString(),
    });
  }

  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function findCharacterFile(id: string): Promise<CharacterFileSummary | null> {
  const summaries = await listCharacterFiles();
  return summaries.find((summary) => summary.id === id) ?? null;
}
