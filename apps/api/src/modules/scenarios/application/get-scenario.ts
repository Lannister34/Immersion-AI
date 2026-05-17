import type { ScenarioDetailDto } from '@immersion/contracts/scenarios';

import { readScenarioDetail } from '../infrastructure/file-scenario-repository.js';

export class ScenarioNotFoundError extends Error {
  constructor(scenarioId: string) {
    super(`Scenario not found: ${scenarioId}`);
    this.name = 'ScenarioNotFoundError';
  }
}

export async function getScenario(id: string): Promise<ScenarioDetailDto> {
  const detail = await readScenarioDetail(id);
  if (!detail) {
    throw new ScenarioNotFoundError(id);
  }
  return detail;
}
