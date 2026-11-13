import type { ScenarioDetailDto, ScenarioSummaryDto } from '@immersion/contracts/scenarios';

export interface ScenarioFields {
  concept: string;
  content: string;
  firstMessage: string;
  name: string;
  tags: string[];
}

export interface ScenarioStore {
  listScenarios(): Promise<ScenarioSummaryDto[]>;
  readScenarioDetail(id: string): Promise<ScenarioDetailDto | null>;
  createScenario(fields: ScenarioFields, savedAt: string): Promise<ScenarioDetailDto>;
  writeScenario(id: string, fields: ScenarioFields, savedAt: string): Promise<ScenarioDetailDto>;
  deleteScenario(id: string): Promise<boolean>;
}
