import type { CharacterDetailDto, CharacterSummaryDto } from '@immersion/contracts/characters';

export type CharacterSummaryRecord = Pick<CharacterSummaryDto, 'avatarUrl' | 'id' | 'name' | 'updatedAt'>;

export interface CharacterFields {
  description: string;
  exampleDialogue: string;
  firstMessage: string;
  name: string;
  personality: string;
  scenario: string;
  systemPrompt: string;
  tags: string[];
}

export interface CharacterStore {
  listCharacters(): Promise<CharacterSummaryRecord[]>;
  findCharacterSummary(id: string): Promise<CharacterSummaryRecord | null>;
  readCharacterDetail(id: string): Promise<CharacterDetailDto | null>;
  createCharacter(fields: CharacterFields, savedAt: string): Promise<CharacterDetailDto>;
  writeCharacter(id: string, fields: CharacterFields, savedAt: string): Promise<CharacterDetailDto>;
  deleteCharacter(id: string): Promise<boolean>;
  readCharacterAvatar(id: string): Promise<Buffer | null>;
  writeCharacterAvatar(id: string, bytes: Buffer, extension: string): Promise<void>;
  deleteCharacterAvatar(id: string): Promise<boolean>;
}
