import type { CharacterDetailDto } from '@immersion/contracts/characters';

import type { CharacterStore } from './character-store.js';
import { CharacterNotFoundError } from './get-character-avatar.js';

export interface GetCharacterDependencies {
  readonly characterStore: Pick<CharacterStore, 'readCharacterDetail'>;
}

export async function getCharacter(
  id: string,
  { characterStore }: GetCharacterDependencies,
): Promise<CharacterDetailDto> {
  const detail = await characterStore.readCharacterDetail(id);
  if (!detail) {
    throw new CharacterNotFoundError(id);
  }
  return detail;
}
