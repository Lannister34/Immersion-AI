import type { ScenarioDetailDto } from '@immersion/contracts/scenarios';

import type { Clock } from '../../../platform/clock/clock.js';
import { ScenarioNotFoundError } from './get-scenario.js';
import type { ScenarioFields, ScenarioStore } from './scenario-store.js';

export interface SaveScenarioDependencies {
  readonly clock: Clock;
  readonly scenarioStore: Pick<ScenarioStore, 'createScenario' | 'readScenarioDetail' | 'writeScenario'>;
}

export async function updateScenario(
  id: string,
  fields: ScenarioFields,
  { clock, scenarioStore }: SaveScenarioDependencies,
): Promise<ScenarioDetailDto> {
  const existing = await scenarioStore.readScenarioDetail(id);
  if (!existing) {
    throw new ScenarioNotFoundError(id);
  }
  return scenarioStore.writeScenario(id, fields, clock.now().toISOString());
}

export async function createScenario(
  fields: ScenarioFields,
  { clock, scenarioStore }: SaveScenarioDependencies,
): Promise<ScenarioDetailDto> {
  return scenarioStore.createScenario(fields, clock.now().toISOString());
}
