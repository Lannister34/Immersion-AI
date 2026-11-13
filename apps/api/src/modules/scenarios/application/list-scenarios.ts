import { type ScenarioListResponse, ScenarioListResponseSchema } from '@immersion/contracts/scenarios';

import type { ScenarioStore } from './scenario-store.js';

export interface ListScenariosDependencies {
  readonly scenarioStore: Pick<ScenarioStore, 'listScenarios'>;
}

export async function listScenarios({ scenarioStore }: ListScenariosDependencies): Promise<ScenarioListResponse> {
  const items = await scenarioStore.listScenarios();
  return ScenarioListResponseSchema.parse({ items });
}
