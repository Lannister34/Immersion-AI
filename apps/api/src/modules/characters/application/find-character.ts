import type { CharacterDetailDto } from '@immersion/contracts/characters';

import { readCharacterDetail } from '../infrastructure/file-character-repository.js';

/**
 * Tolerant public read: returns null when the character is absent.
 * Prefer this over getCharacter for cross-module consumers that treat
 * a missing character as a normal state, not an error.
 */
export async function findCharacter(id: string): Promise<CharacterDetailDto | null> {
  return readCharacterDetail(id);
}
