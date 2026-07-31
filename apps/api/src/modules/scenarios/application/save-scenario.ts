import type { ScenarioDetailDto } from '@immersion/contracts/scenarios';

import {
  createScenarioFile,
  readScenarioDetail,
  writeScenarioFile,
} from '../infrastructure/file-scenario-repository.js';
import { ScenarioNotFoundError } from './get-scenario.js';

export interface SaveScenarioInput {
  concept: string;
  content: string;
  firstMessage: string;
  name: string;
  tags: string[];
}

export async function updateScenario(id: string, input: SaveScenarioInput): Promise<ScenarioDetailDto> {
  const existing = await readScenarioDetail(id);
  if (!existing) {
    throw new ScenarioNotFoundError(id);
  }
  return writeScenarioFile(id, input);
}

export async function createScenario(input: SaveScenarioInput): Promise<ScenarioDetailDto> {
  return createScenarioFile(input);
}
