import type { CharacterStore } from './character-store.js';
import { CharacterAvatarNotFoundError, CharacterNotFoundError } from './get-character-avatar.js';

export interface DeleteCharacterAvatarDependencies {
  readonly characterStore: Pick<CharacterStore, 'deleteCharacterAvatar' | 'findCharacterSummary'>;
}

export async function deleteCharacterAvatar(
  characterId: string,
  { characterStore }: DeleteCharacterAvatarDependencies,
): Promise<void> {
  const summary = await characterStore.findCharacterSummary(characterId);
  if (!summary) {
    throw new CharacterNotFoundError(characterId);
  }

  const removed = await characterStore.deleteCharacterAvatar(summary.id);
  if (!removed) {
    throw new CharacterAvatarNotFoundError(characterId);
  }
}
