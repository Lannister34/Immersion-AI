import {
  CharacterDetailResponseSchema,
  type SaveCharacterCommand,
  SaveCharacterCommandSchema,
} from '@immersion/contracts/characters';

import { apiPost, apiPut } from '../../../shared/api/client';

export function updateCharacter(characterId: string, command: SaveCharacterCommand) {
  return apiPut(
    `/api/characters/${encodeURIComponent(characterId)}`,
    command,
    SaveCharacterCommandSchema,
    CharacterDetailResponseSchema,
  );
}

export function createCharacter(command: SaveCharacterCommand) {
  return apiPost('/api/characters', command, SaveCharacterCommandSchema, CharacterDetailResponseSchema);
}
