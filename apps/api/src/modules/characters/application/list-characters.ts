import { type CharacterListResponse, CharacterListResponseSchema } from '@immersion/contracts/characters';

import { listCharacterFiles } from '../infrastructure/file-character-repository.js';

export async function listCharacters(): Promise<CharacterListResponse> {
  const summaries = await listCharacterFiles();

  return CharacterListResponseSchema.parse({
    items: summaries.map(({ filePath: _filePath, ...summary }) => summary),
  });
}
