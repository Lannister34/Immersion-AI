import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ScenarioDetailDto, ScenarioSummaryDto } from '@immersion/contracts/scenarios';

import { isErrnoCode } from '../../../platform/errno-code.js';
import { writeJsonFileAtomically } from '../../../platform/storage/atomic-file.js';
import { resolveContainedFilePath } from '../../../platform/storage/contained-path.js';
import type { ScenarioFields, ScenarioStore } from '../application/scenario-store.js';

const FILE_EXTENSION = '.json';

export interface FileScenarioStoreOptions {
  readonly directory: string;
}

interface StoredScenario {
  concept?: unknown;
  content?: unknown;
  createdAt?: unknown;
  firstMessage?: unknown;
  name?: unknown;
  tags?: unknown;
  updatedAt?: unknown;
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
    .replace(/\s+/gu, '_')
    .replace(/\.{2,}/gu, '.')
    .replace(/^\.+/u, '');
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

function detailFromStored(id: string, stored: StoredScenario, fallbackUpdatedAt: string): ScenarioDetailDto {
  return {
    concept: asString(stored.concept) ?? '',
    content: asString(stored.content) ?? '',
    createdAt: asString(stored.createdAt),
    firstMessage: asString(stored.firstMessage) ?? '',
    id,
    name: asString(stored.name) ?? path.basename(id, path.extname(id)),
    tags: asStringArray(stored.tags),
    updatedAt: asString(stored.updatedAt) ?? fallbackUpdatedAt,
  };
}

export function createFileScenarioStore({ directory }: FileScenarioStoreOptions): ScenarioStore {
  function resolveScenarioFilePath(id: string): string {
    return resolveContainedFilePath(directory, id);
  }

  async function writeScenario(id: string, fields: ScenarioFields, savedAt: string): Promise<ScenarioDetailDto> {
    await fs.mkdir(directory, { recursive: true });
    const filePath = resolveScenarioFilePath(id);

    let existing: StoredScenario | null = null;
    try {
      existing = JSON.parse(await fs.readFile(filePath, 'utf8')) as StoredScenario;
    } catch {
      existing = null;
    }
    const createdAt = existing && asString(existing.createdAt) ? asString(existing.createdAt) : savedAt;

    const payload = {
      name: fields.name,
      content: fields.content,
      concept: fields.concept,
      firstMessage: fields.firstMessage,
      tags: fields.tags,
      createdAt,
      updatedAt: savedAt,
    };
    await writeJsonFileAtomically(filePath, payload);

    return {
      concept: fields.concept,
      content: fields.content,
      createdAt,
      firstMessage: fields.firstMessage,
      id,
      name: fields.name,
      tags: fields.tags,
      updatedAt: savedAt,
    };
  }

  return {
    async listScenarios() {
      let entries: string[];
      try {
        entries = await fs.readdir(directory);
      } catch (error) {
        if (isErrnoCode(error, 'ENOENT')) {
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
    },

    async readScenarioDetail(id) {
      const filePath = resolveScenarioFilePath(id);
      let raw: string;
      let stats: Awaited<ReturnType<typeof fs.stat>>;
      try {
        [raw, stats] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
      } catch (error) {
        if (isErrnoCode(error, 'ENOENT')) return null;
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
    },

    async createScenario(fields, savedAt) {
      await fs.mkdir(directory, { recursive: true });
      const id = await generateUniqueId(directory, sanitizeBaseName(fields.name));
      return writeScenario(id, fields, savedAt);
    },

    writeScenario,

    async deleteScenario(id) {
      try {
        await fs.unlink(resolveScenarioFilePath(id));
        return true;
      } catch (error) {
        if (isErrnoCode(error, 'ENOENT')) return false;
        throw error;
      }
    },
  };
}
