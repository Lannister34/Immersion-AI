import { apiDeleteNoContent } from '../../../shared/api/client';

export function deleteCharacter(characterId: string): Promise<void> {
  return apiDeleteNoContent(`/api/characters/${encodeURIComponent(characterId)}`);
}
