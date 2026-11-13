import { ScenarioNotFoundError } from './get-scenario.js';
import type { ScenarioStore } from './scenario-store.js';

export interface DeleteScenarioDependencies {
  readonly scenarioStore: Pick<ScenarioStore, 'deleteScenario'>;
}

export async function deleteScenario(id: string, { scenarioStore }: DeleteScenarioDependencies): Promise<void> {
  const removed = await scenarioStore.deleteScenario(id);
  if (!removed) {
    throw new ScenarioNotFoundError(id);
  }
}
