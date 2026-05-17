import { CharacterDetailResponseSchema } from '@immersion/contracts/characters';

import { apiGet } from '../../../shared/api/client';

export function getCharacter(characterId: string) {
  return apiGet(`/api/characters/${encodeURIComponent(characterId)}`, CharacterDetailResponseSchema);
}
