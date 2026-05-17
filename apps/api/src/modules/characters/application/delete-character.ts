import { deleteCharacterFile } from '../infrastructure/file-character-repository.js';
import { CharacterNotFoundError } from './get-character-avatar.js';

export async function deleteCharacter(id: string): Promise<void> {
  const removed = await deleteCharacterFile(id);
  if (!removed) {
    throw new CharacterNotFoundError(id);
  }
}
