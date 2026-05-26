import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { CharacterDetailDto, CharacterSourceFormat, CharacterSummaryDto } from '@immersion/contracts/characters';

import { resolveDataRoot } from '../../../lib/data-root.js';
import {
  type CharacterCardPatch,
  extractPngCharacterCard,
  InvalidCharacterCardError,
  writePngCharacterCard,
} from '../application/extract-png-character-card.js';

const CHARACTERS_DIRECTORY = 'characters';
const JSON_EXTENSION = '.json';

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

function sanitizeBaseName(name: string): string {
  const collapsed = name
    .trim()
    .replace(/[\\/:*?"<>|]+/gu, '_')
    .replace(/\s+/gu, '_');
  const trimmed = collapsed.length > 0 ? collapsed : 'character';
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed;
}

async function generateUniqueId(directory: string, base: string): Promise<string> {
  const baseId = `${base}${JSON_EXTENSION}`;
  try {
    await fs.access(path.join(directory, baseId));
  } catch {
    return baseId;
  }
  const suffix = randomUUID().slice(0, 8);
  return `${base}-${suffix}${JSON_EXTENSION}`;
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

async function writeBinaryAtomic(filePath: string, payload: Buffer) {
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tempPath, payload);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function detailFromStored(
  id: string,
  source: CharacterSourceFormat,
  isEditable: boolean,
  stored: StoredCharacter | null,
  avatarUrl: string | null,
  fallbackUpdatedAt: string,
): CharacterDetailDto {
  const name = asString(stored?.name) ?? path.basename(id, path.extname(id));
  return {
    avatarUrl,
    createdAt: asString(stored?.createdAt),
    description: asString(stored?.description) ?? '',
    exampleDialogue: asString(stored?.exampleDialogue ?? stored?.example_dialogue) ?? '',
    firstMessage: asString(stored?.firstMessage ?? stored?.first_message) ?? '',
    id,
    isEditable,
    name,
    personality: asString(stored?.personality) ?? '',
    scenario: asString(stored?.scenario) ?? '',
    source,
    systemPrompt: asString(stored?.systemPrompt ?? stored?.system_prompt) ?? '',
    tags: asStringArray(stored?.tags),
    updatedAt: asString(stored?.updatedAt) ?? fallbackUpdatedAt,
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
  if (summary.source !== 'json') {
    const stored = await readPngStoredCharacter(summary.filePath);
    const isEditable = stored !== null;
    return detailFromStored(id, summary.source, isEditable, stored, summary.avatarUrl, stats.mtime.toISOString());
  }

  let raw: string;
  try {
    raw = await fs.readFile(summary.filePath, 'utf8');
  } catch {
    return null;
  }
  let parsed: StoredCharacter;
  try {
    parsed = JSON.parse(raw) as StoredCharacter;
  } catch {
    return null;
  }
  return detailFromStored(id, 'json', true, parsed, summary.avatarUrl, stats.mtime.toISOString());
}

async function readPngStoredCharacter(filePath: string): Promise<StoredCharacter | null> {
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return null;
  }
  try {
    const card = extractPngCharacterCard(buffer);
    return {
      description: card.description,
      example_dialogue: card.exampleDialogue,
      first_message: card.firstMessage,
      name: card.name,
      personality: card.personality,
      scenario: card.scenario,
      system_prompt: card.systemPrompt,
      tags: card.tags,
    };
  } catch (error) {
    if (error instanceof InvalidCharacterCardError) {
      // Not a SillyTavern card — fall back to bare filename metadata.
      return null;
    }
    throw error;
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

function resolveCharacterFilePath(id: string) {
  return path.join(resolveCharactersDirectory(), id);
}

export async function writeCharacterFile(id: string, input: SaveCharacterFileInput): Promise<CharacterDetailDto> {
  const directory = resolveCharactersDirectory();
  await fs.mkdir(directory, { recursive: true });
  const filePath = resolveCharacterFilePath(id);

  let existing: StoredCharacter | null = null;
  try {
    existing = JSON.parse(await fs.readFile(filePath, 'utf8')) as StoredCharacter;
  } catch {
    existing = null;
  }
  const now = new Date().toISOString();
  const createdAt = existing && asString(existing.createdAt) ? asString(existing.createdAt) : now;

  const payload = {
    name: input.name,
    description: input.description,
    personality: input.personality,
    scenario: input.scenario,
    first_message: input.firstMessage,
    example_dialogue: input.exampleDialogue,
    system_prompt: input.systemPrompt,
    tags: input.tags,
    createdAt,
    updatedAt: now,
  };
  await writeJsonAtomic(filePath, payload);

  return {
    avatarUrl: null,
    createdAt,
    description: input.description,
    exampleDialogue: input.exampleDialogue,
    firstMessage: input.firstMessage,
    id,
    isEditable: true,
    name: input.name,
    personality: input.personality,
    scenario: input.scenario,
    source: 'json',
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

export async function writePngCharacterFile(id: string, input: SaveCharacterFileInput): Promise<CharacterDetailDto> {
  const filePath = resolveCharacterFilePath(id);
  const original = await fs.readFile(filePath);
  const patch: CharacterCardPatch = {
    description: input.description,
    exampleDialogue: input.exampleDialogue,
    firstMessage: input.firstMessage,
    name: input.name,
    personality: input.personality,
    scenario: input.scenario,
    systemPrompt: input.systemPrompt,
    tags: [...input.tags],
  };
  const next = writePngCharacterCard(original, patch);
  await writeBinaryAtomic(filePath, next);

  const stats = await fs.stat(filePath);
  const avatarUrl = `/api/characters/${encodeURIComponent(id)}/avatar`;
  return {
    avatarUrl,
    createdAt: null,
    description: input.description,
    exampleDialogue: input.exampleDialogue,
    firstMessage: input.firstMessage,
    id,
    isEditable: true,
    name: input.name,
    personality: input.personality,
    scenario: input.scenario,
    source: 'png',
    systemPrompt: input.systemPrompt,
    tags: [...input.tags],
    updatedAt: stats.mtime.toISOString(),
  };
}

export async function deleteCharacterFile(id: string): Promise<boolean> {
  const filePath = resolveCharacterFilePath(id);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === 'ENOENT') return false;
    throw error;
  }
}
