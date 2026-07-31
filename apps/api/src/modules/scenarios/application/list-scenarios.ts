import { type ScenarioListResponse, ScenarioListResponseSchema } from '@immersion/contracts/scenarios';

import { listScenarioFiles } from '../infrastructure/file-scenario-repository.js';

export async function listScenarios(): Promise<ScenarioListResponse> {
  const items = await listScenarioFiles();
  return ScenarioListResponseSchema.parse({ items });
}
