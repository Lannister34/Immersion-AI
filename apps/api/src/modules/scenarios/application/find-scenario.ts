import type { ScenarioDetailDto } from '@immersion/contracts/scenarios';

import { readScenarioDetail } from '../infrastructure/file-scenario-repository.js';

/**
 * Tolerant public read: returns null when the scenario is absent.
 * Prefer this over getScenario for cross-module consumers that treat
 * a missing scenario as a normal state, not an error.
 */
export async function findScenario(id: string): Promise<ScenarioDetailDto | null> {
  return readScenarioDetail(id);
}
