import type { CharacterDetailDto } from '@immersion/contracts/characters';
import type { LorebookDetailDto } from '@immersion/contracts/lorebooks';
import type { ScenarioDetailDto } from '@immersion/contracts/scenarios';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';

export type PromptCharacterRecord = Pick<
  CharacterDetailDto,
  'description' | 'exampleDialogue' | 'name' | 'personality' | 'scenario' | 'systemPrompt'
>;

export type PromptLorebookRecord = Pick<LorebookDetailDto, 'entries' | 'name'>;

export type PromptScenarioRecord = Pick<ScenarioDetailDto, 'concept' | 'content' | 'name'>;

export interface CharacterDetailReader {
  findCharacter(characterId: string): Promise<PromptCharacterRecord | null>;
}

export interface LorebookReader {
  findLorebook(lorebookId: string): Promise<PromptLorebookRecord | null>;
}

export interface ScenarioReader {
  findScenario(scenarioId: string): Promise<PromptScenarioRecord | null>;
}

export interface GenerationSettingsSource {
  getSettingsOverview(): SettingsOverviewResponse;
}
