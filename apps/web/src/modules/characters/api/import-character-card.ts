import {
  CharacterDetailResponseSchema,
  type ImportCharacterCardCommand,
  ImportCharacterCardCommandSchema,
} from '@immersion/contracts/characters';

import { apiPost } from '../../../shared/api/client';

export function importCharacterCard(command: ImportCharacterCardCommand) {
  return apiPost('/api/characters/import', command, ImportCharacterCardCommandSchema, CharacterDetailResponseSchema);
}
