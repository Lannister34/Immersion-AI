import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { CharacterDetailDto } from '@immersion/contracts/characters';

import { writeFileAtomically, writeJsonFileAtomically } from '../../../lib/atomic-file.js';
import { resolveContainedFilePath } from '../../../lib/contained-path.js';
import { resolveDataRoot } from '../../../lib/data-root.js';
import {
  extractPngCharacterCard,
  InvalidCharacterCardError,
  pngContainsCharacterCard,
} from '../application/extract-png-character-card.js';

const CHARACTERS_DIRECTORY = 'characters';
const JSON_EXTENSION = '.json';
const AVATAR_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;

export interface CharacterFileSummary {
  avatarUrl: string | null;
  filePath: string;
  id: string;
  name: string;
  updatedAt: string;
}

function resolveCharactersDirectory() {
  return path.join(resolveDataRoot(), CHARACTERS_DIRECTORY);
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
  // The mtime-derived version makes every avatar replacement produce a new URL,
  // so clients never keep showing a stale cached image.
  return `/api/characters/${encodeURIComponent(id)}/avatar?v=${Math.trunc(mtimeMs)}`;
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

export interface SaveCharacterFileInput {
  description: string;
  exampleDialogue: string;
  firstMessage: string;
  name: string;
  personality: string;
  scenario: string;
  systemPrompt: string;
  tags: string[];
}

function toStoredCharacter(input: SaveCharacterFileInput, createdAt: string, updatedAt: string) {
  return {
    name: input.name,
    description: input.description,
    personality: input.personality,
    scenario: input.scenario,
    first_message: input.firstMessage,
    example_dialogue: input.exampleDialogue,
    system_prompt: input.systemPrompt,
    tags: input.tags,
    createdAt,
    updatedAt,
  };
}

/**
 * Раньше PNG-карточка сама была персонажем, и в списке он назывался по имени
 * файла — а внутри карточки могло стоять совсем другое имя. Теперь персонаж
 * всегда JSON, а картинка рядом — его аватар. Одинокие карточки переводим при
 * первом же чтении списка; сам PNG не трогаем, он остаётся годным для экспорта.
 */
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

    // Время правки берём у картинки: иначе после перехода все старые карточки
    // всплыли бы наверх списка как «только что изменённые».
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

  const migrated = await migrateLegacyPngCharacterCards(directory, entries);
  const summaries: CharacterFileSummary[] = [];

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
      avatarUrl: await characterAvatarUrlFor(entry),
      filePath,
      id: entry,
      // Имя живёт в карточке; файл — только адрес, и переименование его не трогает.
      name: asString(stored?.name) ?? baseNameOf(entry),
      updatedAt: asString(stored?.updatedAt) ?? stats.mtime.toISOString(),
    });
  }

  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function findCharacterFile(id: string): Promise<CharacterFileSummary | null> {
  const summaries = await listCharacterFiles();
  const direct = summaries.find((summary) => summary.id === id);
  if (direct) return direct;
  if (!isAvatarEntry(id)) return null;

  // Чаты, привязанные до перехода на JSON, всё ещё ссылаются на файл картинки.
  const migratedId = `${baseNameOf(id)}${JSON_EXTENSION}`;
  return summaries.find((summary) => summary.id === migratedId) ?? null;
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
  // Sibling image files with the same base name are treated as the card's avatar,
  // so a fresh JSON id must not collide with any of them either.
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

export async function readCharacterDetail(id: string): Promise<CharacterDetailDto | null> {
  const summary = await findCharacterFile(id);
  if (!summary) return null;

  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stats = await fs.stat(summary.filePath);
  } catch {
    return null;
  }

  const stored = await readStoredCharacter(summary.filePath);
  if (!stored) return null;

  return detailFromStored(summary.id, stored, summary.avatarUrl, stats.mtime.toISOString());
}

function resolveCharacterFilePath(id: string) {
  return resolveContainedFilePath(resolveCharactersDirectory(), id);
}

export async function writeCharacterFile(id: string, input: SaveCharacterFileInput): Promise<CharacterDetailDto> {
  const directory = resolveCharactersDirectory();
  await fs.mkdir(directory, { recursive: true });
  const filePath = resolveCharacterFilePath(id);

  const existing = await readStoredCharacter(filePath);
  const now = new Date().toISOString();
  const createdAt = asString(existing?.createdAt) ?? now;

  await writeJsonFileAtomically(filePath, toStoredCharacter(input, createdAt, now));

  return {
    avatarUrl: await characterAvatarUrlFor(id),
    createdAt,
    description: input.description,
    exampleDialogue: input.exampleDialogue,
    firstMessage: input.firstMessage,
    id,
    name: input.name,
    personality: input.personality,
    scenario: input.scenario,
    systemPrompt: input.systemPrompt,
    tags: input.tags,
    updatedAt: now,
  };
}

export async function createCharacterFile(input: SaveCharacterFileInput): Promise<CharacterDetailDto> {
  const directory = resolveCharactersDirectory();
  await fs.mkdir(directory, { recursive: true });
  const base = sanitizeBaseName(input.name);
  const id = await generateUniqueId(directory, base);
  return writeCharacterFile(id, input);
}

export async function deleteCharacterFile(id: string): Promise<boolean> {
  const filePath = resolveCharacterFilePath(id);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') return false;
    throw error;
  }
  // The card owns its sibling avatar image; do not leave orphans behind.
  await deleteCharacterAvatarFiles(id);
  return true;
}

function avatarCandidatePathsOf(id: string): string[] {
  const directory = resolveCharactersDirectory();
  const base = baseNameOf(id);
  return AVATAR_FILE_EXTENSIONS.map((extension) => resolveContainedFilePath(directory, `${base}${extension}`));
}

/** Finds the sibling avatar image of a card, if any. */
export async function findCharacterAvatarFilePath(id: string): Promise<string | null> {
  for (const candidate of avatarCandidatePathsOf(id)) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) return candidate;
    } catch {
      // Missing candidate — keep looking.
    }
  }
  return null;
}

/** Versioned avatar URL of a card's sibling image, or null when it has none. */
export async function characterAvatarUrlFor(id: string): Promise<string | null> {
  const avatarFilePath = await findCharacterAvatarFilePath(id);
  if (!avatarFilePath) return null;
  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stats = await fs.stat(avatarFilePath);
  } catch {
    return null;
  }
  return characterAvatarUrlOf(id, stats.mtimeMs);
}

/** Stores the avatar of a card as a sibling file, replacing any previous avatar. */
export async function writeCharacterAvatarFile(id: string, bytes: Buffer, extension: string): Promise<void> {
  const directory = resolveCharactersDirectory();
  await fs.mkdir(directory, { recursive: true });
  const targetPath = resolveContainedFilePath(directory, `${baseNameOf(id)}${extension}`);
  for (const candidate of avatarCandidatePathsOf(id)) {
    if (candidate === targetPath) continue;
    await fs.rm(candidate, { force: true });
  }
  await writeFileAtomically(targetPath, bytes);
}

/** Removes every sibling avatar image of a card. Returns false when none existed. */
export async function deleteCharacterAvatarFiles(id: string): Promise<boolean> {
  let removed = false;
  for (const candidate of avatarCandidatePathsOf(id)) {
    try {
      await fs.unlink(candidate);
      removed = true;
    } catch (error) {
      const failure = error as NodeJS.ErrnoException;
      if (failure.code !== 'ENOENT') throw error;
    }
  }
  return removed;
}
