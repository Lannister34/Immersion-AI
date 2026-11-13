import type { ScenarioDetailDto } from '@immersion/contracts/scenarios';

import type { ScenarioStore } from './scenario-store.js';

export class ScenarioNotFoundError extends Error {
  constructor(scenarioId: string) {
    super(`Scenario not found: ${scenarioId}`);
    this.name = 'ScenarioNotFoundError';
  }
}

export interface GetScenarioDependencies {
  readonly scenarioStore: Pick<ScenarioStore, 'readScenarioDetail'>;
}

export async function getScenario(id: string, { scenarioStore }: GetScenarioDependencies): Promise<ScenarioDetailDto> {
  const detail = await scenarioStore.readScenarioDetail(id);
  if (!detail) {
    throw new ScenarioNotFoundError(id);
  }
  return detail;
}
