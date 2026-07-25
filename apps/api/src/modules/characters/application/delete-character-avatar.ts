import { deleteCharacterAvatarFiles, findCharacterFile } from '../infrastructure/file-character-repository.js';
import { CharacterAvatarNotFoundError, CharacterNotFoundError } from './get-character-avatar.js';

export async function deleteCharacterAvatar(characterId: string): Promise<void> {
  const summary = await findCharacterFile(characterId);
  if (!summary) {
    throw new CharacterNotFoundError(characterId);
  }

  const removed = await deleteCharacterAvatarFiles(summary.id);
  if (!removed) {
    throw new CharacterAvatarNotFoundError(characterId);
  }
}
