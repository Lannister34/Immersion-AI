import fs from 'node:fs/promises';
import path from 'node:path';

import type { ScenarioSummaryDto } from '@immersion/contracts/scenarios';

import { resolveDataRoot } from '../../../lib/data-root.js';

const SCENARIOS_DIRECTORY = 'scenarios';

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
