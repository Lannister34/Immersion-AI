import type { CharacterDetailDto } from '@immersion/contracts/characters';

import {
  createCharacterFile,
  readCharacterDetail,
  writeCharacterFile,
} from '../infrastructure/file-character-repository.js';
import { CharacterNotFoundError } from './get-character-avatar.js';

export class CharacterNotEditableError extends Error {
  constructor(characterId: string) {
    super(`Character is not editable in this format: ${characterId}`);
    this.name = 'CharacterNotEditableError';
  }
}

export interface SaveCharacterInput {
  description: string;
  exampleDialogue: string;
  firstMessage: string;
  name: string;
  personality: string;
  scenario: string;
  systemPrompt: string;
  tags: string[];
}

export async function updateCharacter(id: string, input: SaveCharacterInput): Promise<CharacterDetailDto> {
  const existing = await readCharacterDetail(id);
  if (!existing) {
    throw new CharacterNotFoundError(id);
  }
  if (!existing.isEditable) {
    throw new CharacterNotEditableError(id);
  }
  return writeCharacterFile(id, input);
}

export async function createCharacter(input: SaveCharacterInput): Promise<CharacterDetailDto> {
  return createCharacterFile(input);
}
