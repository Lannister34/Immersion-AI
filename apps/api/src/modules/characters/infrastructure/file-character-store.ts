import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { CharacterDetailDto } from '@immersion/contracts/characters';

import { isErrnoCode } from '../../../platform/errno-code.js';
import type { LogPort } from '../../../platform/logging/log-port.js';
import { writeFileAtomically, writeJsonFileAtomically } from '../../../platform/storage/atomic-file.js';
import { resolveContainedFilePath } from '../../../platform/storage/contained-path.js';
import type { CharacterFields, CharacterStore, CharacterSummaryRecord } from '../application/character-store.js';
import {
  extractPngCharacterCard,
  InvalidCharacterCardError,
  pngContainsCharacterCard,
} from '../application/extract-png-character-card.js';

const JSON_EXTENSION = '.json';
const AVATAR_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;

export interface FileCharacterStoreOptions {
  readonly directory: string;
  readonly logger: LogPort;
}

interface CharacterFileEntry extends CharacterSummaryRecord {
  filePath: string;
}

interface StoredCharacter {
  createdAt?: unknown;
  description?: unknown;
  example_dialogue?: unknown;
  exampleDialogue?: unknown;
  first_message?: unknown;
  firstMessage?: unknown;
  name?: unknown;
  personality?: unknown;
  scenario?: unknown;
  system_prompt?: unknown;
  systemPrompt?: unknown;
  tags?: unknown;
  updatedAt?: unknown;
}

function isJsonEntry(entry: string): boolean {
  return entry.toLowerCase().endsWith(JSON_EXTENSION);
}

function isAvatarEntry(entry: string): boolean {
  const lower = entry.toLowerCase();
  return AVATAR_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function baseNameOf(entry: string): string {
  return path.basename(entry, path.extname(entry));
}

function characterAvatarUrlOf(id: string, mtimeMs: number): string {
  return `/api/characters/${encodeURIComponent(id)}/avatar?v=${Math.trunc(mtimeMs)}`;
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

async function readStoredCharacter(filePath: string): Promise<StoredCharacter | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as StoredCharacter;
  } catch {
    return null;
  }
}

function toStoredCharacter(fields: CharacterFields, createdAt: string, updatedAt: string) {
  return {
    name: fields.name,
    description: fields.description,
    personality: fields.personality,
    scenario: fields.scenario,
    first_message: fields.firstMessage,
    example_dialogue: fields.exampleDialogue,
    system_prompt: fields.systemPrompt,
    tags: fields.tags,
    createdAt,
    updatedAt,
  };
}

async function migrateLegacyPngCharacterCards(directory: string, entries: string[]): Promise<string[]> {
  const jsonBaseNames = new Set(entries.filter(isJsonEntry).map(baseNameOf));
  const created: string[] = [];

  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.png')) continue;
    const base = baseNameOf(entry);
    if (jsonBaseNames.has(base)) continue;

    const filePath = path.join(directory, entry);
    let stats: Awaited<ReturnType<typeof fs.stat>>;
    let buffer: Buffer;
    try {
      stats = await fs.stat(filePath);
      if (!stats.isFile()) continue;
      buffer = await fs.readFile(filePath);
    } catch {
      continue;
    }
    if (!pngContainsCharacterCard(buffer)) continue;

    let card: ReturnType<typeof extractPngCharacterCard>;
    try {
      card = extractPngCharacterCard(buffer);
    } catch (error) {
      if (error instanceof InvalidCharacterCardError) continue;
      throw error;
    }

    const savedAt = stats.mtime.toISOString();
    const jsonEntry = `${base}${JSON_EXTENSION}`;
    await writeJsonFileAtomically(
      resolveContainedFilePath(directory, jsonEntry),
      toStoredCharacter(
        {
          description: card.description,
          exampleDialogue: card.exampleDialogue,
          firstMessage: card.firstMessage,
          name: card.name,
          personality: card.personality,
          scenario: card.scenario,
          systemPrompt: card.systemPrompt,
          tags: [...card.tags],
        },
        savedAt,
        savedAt,
      ),
    );
    created.push(jsonEntry);
  }

  return created;
}

function sanitizeBaseName(name: string): string {
  const collapsed = name
    .trim()
    .replace(/[\\/:*?"<>|]+/gu, '_')
    .replace(/\s+/gu, '_')
    .replace(/\.{2,}/gu, '.')
    .replace(/^\.+/u, '');
  const trimmed = collapsed.length > 0 ? collapsed : 'character';
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generateUniqueId(directory: string, base: string): Promise<string> {
  const conflicts = await Promise.all(
    [JSON_EXTENSION, ...AVATAR_FILE_EXTENSIONS].map((extension) =>
      fileExists(path.join(directory, `${base}${extension}`)),
    ),
  );
  if (!conflicts.some(Boolean)) {
    return `${base}${JSON_EXTENSION}`;
  }
  const suffix = randomUUID().slice(0, 8);
  return `${base}-${suffix}${JSON_EXTENSION}`;
}

function detailFromStored(
  id: string,
  stored: StoredCharacter,
  avatarUrl: string | null,
  fallbackUpdatedAt: string,
): CharacterDetailDto {
  return {
    avatarUrl,
    createdAt: asString(stored.createdAt),
    description: asString(stored.description) ?? '',
    exampleDialogue: asString(stored.exampleDialogue ?? stored.example_dialogue) ?? '',
    firstMessage: asString(stored.firstMessage ?? stored.first_message) ?? '',
    id,
    name: asString(stored.name) ?? baseNameOf(id),
    personality: asString(stored.personality) ?? '',
    scenario: asString(stored.scenario) ?? '',
    systemPrompt: asString(stored.systemPrompt ?? stored.system_prompt) ?? '',
    tags: asStringArray(stored.tags),
    updatedAt: asString(stored.updatedAt) ?? fallbackUpdatedAt,
  };
}

function toSummaryRecord({ filePath: _filePath, ...summary }: CharacterFileEntry): CharacterSummaryRecord {
  return summary;
}

export function createFileCharacterStore({ directory, logger }: FileCharacterStoreOptions): CharacterStore {
  function resolveCharacterFilePath(id: string): string {
    return resolveContainedFilePath(directory, id);
  }

  function avatarCandidatePathsOf(id: string): string[] {
    const base = baseNameOf(id);
    return AVATAR_FILE_EXTENSIONS.map((extension) => resolveContainedFilePath(directory, `${base}${extension}`));
  }

  async function findAvatarFilePath(id: string): Promise<string | null> {
    for (const candidate of avatarCandidatePathsOf(id)) {
      try {
        const stats = await fs.stat(candidate);
        if (stats.isFile()) return candidate;
      } catch (error) {
        if (!isErrnoCode(error, 'ENOENT')) {
          logger.warn(
            { characterId: id, err: error, path: candidate },
            'Character avatar: failed to read an avatar candidate; skipping it',
          );
        }
      }
    }
    return null;
  }

  async function avatarUrlFor(id: string): Promise<string | null> {
    const avatarFilePath = await findAvatarFilePath(id);
    if (!avatarFilePath) return null;
    let stats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stats = await fs.stat(avatarFilePath);
    } catch {
      return null;
    }
    return characterAvatarUrlOf(id, stats.mtimeMs);
  }

  async function listEntries(): Promise<CharacterFileEntry[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(directory);
    } catch (error) {
      if (isErrnoCode(error, 'ENOENT')) {
        return [];
      }
      throw error;
    }

    const migrated = await migrateLegacyPngCharacterCards(directory, entries);
    const summaries: CharacterFileEntry[] = [];

    for (const entry of [...entries, ...migrated]) {
      if (!isJsonEntry(entry)) continue;

      const filePath = path.join(directory, entry);
      let stats: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stats = await fs.stat(filePath);
      } catch {
        continue;
      }
      if (!stats.isFile()) continue;

      const stored = await readStoredCharacter(filePath);
      summaries.push({
        avatarUrl: await avatarUrlFor(entry),
        filePath,
        id: entry,
        name: asString(stored?.name) ?? baseNameOf(entry),
        updatedAt: asString(stored?.updatedAt) ?? stats.mtime.toISOString(),
      });
    }

    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function findEntry(id: string): Promise<CharacterFileEntry | null> {
    const summaries = await listEntries();
    const direct = summaries.find((summary) => summary.id === id);
    if (direct) return direct;
    if (!isAvatarEntry(id)) return null;

    const migratedId = `${baseNameOf(id)}${JSON_EXTENSION}`;
    return summaries.find((summary) => summary.id === migratedId) ?? null;
  }

  async function writeCharacter(id: string, fields: CharacterFields, savedAt: string): Promise<CharacterDetailDto> {
    await fs.mkdir(directory, { recursive: true });
    const filePath = resolveCharacterFilePath(id);

    const existing = await readStoredCharacter(filePath);
    const createdAt = asString(existing?.createdAt) ?? savedAt;

    await writeJsonFileAtomically(filePath, toStoredCharacter(fields, createdAt, savedAt));

    return {
      avatarUrl: await avatarUrlFor(id),
      createdAt,
      description: fields.description,
      exampleDialogue: fields.exampleDialogue,
      firstMessage: fields.firstMessage,
      id,
      name: fields.name,
      personality: fields.personality,
      scenario: fields.scenario,
      systemPrompt: fields.systemPrompt,
      tags: fields.tags,
      updatedAt: savedAt,
    };
  }

  async function deleteCharacterAvatar(id: string): Promise<boolean> {
    let removed = false;
    for (const candidate of avatarCandidatePathsOf(id)) {
      try {
        await fs.unlink(candidate);
        removed = true;
      } catch (error) {
        if (!isErrnoCode(error, 'ENOENT')) throw error;
      }
    }
    return removed;
  }

  return {
    async listCharacters() {
      return (await listEntries()).map(toSummaryRecord);
    },

    async findCharacterSummary(id) {
      const entry = await findEntry(id);
      return entry ? toSummaryRecord(entry) : null;
    },

    async readCharacterDetail(id) {
      const entry = await findEntry(id);
      if (!entry) return null;

      let stats: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stats = await fs.stat(entry.filePath);
      } catch {
        return null;
      }

      const stored = await readStoredCharacter(entry.filePath);
      if (!stored) return null;

      return detailFromStored(entry.id, stored, entry.avatarUrl, stats.mtime.toISOString());
    },

    async createCharacter(fields, savedAt) {
      await fs.mkdir(directory, { recursive: true });
      const id = await generateUniqueId(directory, sanitizeBaseName(fields.name));
      return writeCharacter(id, fields, savedAt);
    },

    writeCharacter,

    async deleteCharacter(id) {
      try {
        await fs.unlink(resolveCharacterFilePath(id));
      } catch (error) {
        if (isErrnoCode(error, 'ENOENT')) return false;
        throw error;
      }
      await deleteCharacterAvatar(id);
      return true;
    },

    async readCharacterAvatar(id) {
      const avatarFilePath = await findAvatarFilePath(id);
      return avatarFilePath ? fs.readFile(avatarFilePath) : null;
    },

    async writeCharacterAvatar(id, bytes, extension) {
      await fs.mkdir(directory, { recursive: true });
      const targetPath = resolveContainedFilePath(directory, `${baseNameOf(id)}${extension}`);
      for (const candidate of avatarCandidatePathsOf(id)) {
        if (candidate === targetPath) continue;
        await fs.rm(candidate, { force: true });
      }
      await writeFileAtomically(targetPath, bytes);
    },

    deleteCharacterAvatar,
  };
}
