import type { CharacterStore } from './character-store.js';
import { CharacterNotFoundError } from './get-character-avatar.js';

export interface DeleteCharacterDependencies {
  readonly characterStore: Pick<CharacterStore, 'deleteCharacter'>;
}

export async function deleteCharacter(id: string, { characterStore }: DeleteCharacterDependencies): Promise<void> {
  const removed = await characterStore.deleteCharacter(id);
  if (!removed) {
    throw new CharacterNotFoundError(id);
  }
}
