import fs from 'node:fs/promises';

import { findCharacterAvatarFilePath, findCharacterFile } from '../infrastructure/file-character-repository.js';
import { avatarContentTypeOf } from './avatar-image-format.js';

export class CharacterNotFoundError extends Error {
  constructor(characterId: string) {
    super(`Character not found: ${characterId}`);
    this.name = 'CharacterNotFoundError';
  }
}

export class CharacterAvatarNotFoundError extends Error {
  constructor(characterId: string) {
    super(`Character has no avatar: ${characterId}`);
    this.name = 'CharacterAvatarNotFoundError';
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

  const avatarFilePath = await findCharacterAvatarFilePath(summary.id);
  if (!avatarFilePath) {
    throw new CharacterAvatarNotFoundError(characterId);
  }
  const body = await fs.readFile(avatarFilePath);
  return {
    body,
    contentType: avatarContentTypeOf(body),
  };
}
