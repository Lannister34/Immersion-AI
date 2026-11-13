import { avatarContentTypeOf } from './avatar-image-format.js';
import type { CharacterStore } from './character-store.js';

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

export interface GetCharacterAvatarDependencies {
  readonly characterStore: Pick<CharacterStore, 'findCharacterSummary' | 'readCharacterAvatar'>;
}

export async function getCharacterAvatar(
  characterId: string,
  { characterStore }: GetCharacterAvatarDependencies,
): Promise<CharacterAvatarPayload> {
  const summary = await characterStore.findCharacterSummary(characterId);
  if (!summary) {
    throw new CharacterNotFoundError(characterId);
  }

  const body = await characterStore.readCharacterAvatar(summary.id);
  if (!body) {
    throw new CharacterAvatarNotFoundError(characterId);
  }
  return {
    body,
    contentType: avatarContentTypeOf(body),
  };
}
