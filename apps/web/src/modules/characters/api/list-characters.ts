import { CharacterListResponseSchema } from '@immersion/contracts/characters';

import { apiGet } from '../../../shared/api/client';

export function listCharacters() {
  return apiGet('/api/characters', CharacterListResponseSchema);
}
