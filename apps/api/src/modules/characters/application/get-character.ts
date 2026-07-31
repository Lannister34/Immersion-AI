import type { CharacterDetailDto } from '@immersion/contracts/characters';

import { readCharacterDetail } from '../infrastructure/file-character-repository.js';
import { CharacterNotFoundError } from './get-character-avatar.js';

export async function getCharacter(id: string): Promise<CharacterDetailDto> {
  const detail = await readCharacterDetail(id);
  if (!detail) {
    throw new CharacterNotFoundError(id);
  }
  return detail;
}
