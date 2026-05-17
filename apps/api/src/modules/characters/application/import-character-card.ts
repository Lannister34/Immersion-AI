import fs from 'node:fs/promises';
import path from 'node:path';

import type { CharacterDetailDto } from '@immersion/contracts/characters';

import { resolveDataRoot } from '../../../lib/data-root.js';
import { createCharacterFile } from '../infrastructure/file-character-repository.js';
import { extractPngCharacterCard, InvalidCharacterCardError } from './extract-png-character-card.js';

const CHARACTERS_DIRECTORY = 'characters';

function sanitizeFileBaseName(name: string): string {
  const trimmed = name
    .trim()
    .replace(/[\\/:*?"<>|]+/gu, '_')
    .replace(/\s+/gu, '_');
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed || 'imported-character';
}

async function persistAvatarAlongside(
  characterId: string,
  pngBuffer: Buffer,
  originalFileName: string,
): Promise<string | null> {
  const charactersDir = path.join(resolveDataRoot(), CHARACTERS_DIRECTORY);
  await fs.mkdir(charactersDir, { recursive: true });
  const baseName = path.basename(characterId, path.extname(characterId));
  const avatarFile = `${baseName}.png`;
  const target = path.join(charactersDir, avatarFile);

  // Avoid clobbering an existing PNG with the same base name.
  try {
    await fs.access(target);
    // File exists; keep original filename to disambiguate.
    const alt = `${baseName}-${path.basename(originalFileName, '.png').slice(0, 32)}.png`;
    await fs.writeFile(path.join(charactersDir, alt), pngBuffer);
    return alt;
  } catch {
    await fs.writeFile(target, pngBuffer);
    return avatarFile;
  }
}

export interface ImportCharacterCardInput {
  contentBase64: string;
  fileName: string;
}

export async function importCharacterCard(input: ImportCharacterCardInput): Promise<CharacterDetailDto> {
  const lower = input.fileName.toLowerCase();
  if (!lower.endsWith('.png')) {
    throw new InvalidCharacterCardError('Only PNG character cards can be imported in this slice.');
  }

  const pngBuffer = Buffer.from(input.contentBase64, 'base64');
  if (pngBuffer.length === 0) {
    throw new InvalidCharacterCardError('Uploaded file is empty.');
  }

  const card = extractPngCharacterCard(pngBuffer);
  const baseName = sanitizeFileBaseName(card.name);
  const fileName = `${baseName}.json`;

  // Reuse the file repo's createCharacterFile: it picks a non-clashing JSON id.
  const detail = await createCharacterFile({
    description: card.description,
    exampleDialogue: card.exampleDialogue,
    firstMessage: card.firstMessage,
    name: card.name,
    personality: card.personality,
    scenario: card.scenario,
    systemPrompt: card.systemPrompt,
    tags: card.tags,
  });

  const avatarFile = await persistAvatarAlongside(detail.id, pngBuffer, input.fileName);

  void fileName; // intentionally unused: createCharacterFile picks the JSON id itself.

  return {
    ...detail,
    avatarUrl: avatarFile ? `/api/characters/${encodeURIComponent(avatarFile)}/avatar` : detail.avatarUrl,
  };
}
