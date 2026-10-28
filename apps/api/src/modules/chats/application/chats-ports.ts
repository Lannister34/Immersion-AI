import type { CharacterDetailDto } from '@immersion/contracts/characters';
import type { ScenarioDetailDto } from '@immersion/contracts/scenarios';
import type { ReplyBudgetSettings } from '@immersion/domain/prompting';

import type { ChatSummaryRecord } from './chat-records.js';

export type ChatCharacterRecord = Pick<
  CharacterDetailDto,
  'description' | 'firstMessage' | 'id' | 'name' | 'personality' | 'scenario'
>;

export type ChatScenarioRecord = Pick<ScenarioDetailDto, 'content' | 'firstMessage' | 'id' | 'name'>;

export interface ChatCharacterReader {
  getCharacter(characterId: string): Promise<ChatCharacterRecord>;
}

export interface ChatScenarioReader {
  getScenario(scenarioId: string): Promise<ChatScenarioRecord>;
}

export interface ProfileUserNameSource {
  getProfileUserName(): string;
}

export interface SamplerPresetReader {
  findSamplerPreset(presetId: string): ReplyBudgetSettings | null;
}

export interface ChatListIndexPort {
  listChatSummaries(options: { searchText?: string }): Promise<ChatSummaryRecord[]>;
}
