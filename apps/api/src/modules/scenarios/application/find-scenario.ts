import type { ScenarioDetailDto } from '@immersion/contracts/scenarios';

import { readScenarioDetail } from '../infrastructure/file-scenario-repository.js';

export async function findScenario(id: string): Promise<ScenarioDetailDto | null> {
  return readScenarioDetail(id);
}
