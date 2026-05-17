import fs from 'node:fs/promises';

import { findCharacterFile } from '../infrastructure/file-character-repository.js';

export class CharacterNotFoundError extends Error {
  constructor(characterId: string) {
    super(`Character not found: ${characterId}`);
    this.name = 'CharacterNotFoundError';
  }
}

export interface CharacterAvatarPayload {
  body: Buffer;
  contentType: string;
}

export async function getCharacterAvatar(characterId: string): Promise<CharacterAvatarPayload> {
  const summary = await findCharacterFile(characterId);
  if (!summary) {
    throw new CharacterNotFoundError(characterId);
  }
  if (summary.source !== 'png') {
    throw new CharacterNotFoundError(characterId);
  }

  const body = await fs.readFile(summary.filePath);
  return {
    body,
    contentType: 'image/png',
  };
}
