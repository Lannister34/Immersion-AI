import type { CharacterDetailDto } from '@immersion/contracts/characters';

import type { Clock } from '../../../platform/clock/clock.js';
import type { CharacterFields, CharacterStore } from './character-store.js';
import { CharacterNotFoundError } from './get-character-avatar.js';

export interface SaveCharacterDependencies {
  readonly characterStore: Pick<CharacterStore, 'createCharacter' | 'readCharacterDetail' | 'writeCharacter'>;
  readonly clock: Clock;
}

export async function updateCharacter(
  id: string,
  fields: CharacterFields,
  { characterStore, clock }: SaveCharacterDependencies,
): Promise<CharacterDetailDto> {
  const existing = await characterStore.readCharacterDetail(id);
  if (!existing) {
    throw new CharacterNotFoundError(id);
  }
  return characterStore.writeCharacter(existing.id, fields, clock.now().toISOString());
}

export async function createCharacter(
  fields: CharacterFields,
  { characterStore, clock }: SaveCharacterDependencies,
): Promise<CharacterDetailDto> {
  return characterStore.createCharacter(fields, clock.now().toISOString());
}
