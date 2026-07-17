import { deleteCharacterAvatarFiles, findCharacterFile } from '../infrastructure/file-character-repository.js';
import { CharacterAvatarNotFoundError, CharacterNotFoundError } from './get-character-avatar.js';
import { CharacterAvatarOwnedByCardError } from './upload-character-avatar.js';

export async function deleteCharacterAvatar(characterId: string): Promise<void> {
  const summary = await findCharacterFile(characterId);
  if (!summary) {
    throw new CharacterNotFoundError(characterId);
  }
  if (summary.source !== 'json') {
    throw new CharacterAvatarOwnedByCardError(characterId);
  }

  const removed = await deleteCharacterAvatarFiles(characterId);
  if (!removed) {
    throw new CharacterAvatarNotFoundError(characterId);
  }
}
