import type { CharacterDetailDto } from '@immersion/contracts/characters';

import { readCharacterDetail } from '../infrastructure/file-character-repository.js';

export async function findCharacter(id: string): Promise<CharacterDetailDto | null> {
  return readCharacterDetail(id);
}
