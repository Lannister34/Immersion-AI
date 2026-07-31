import {
  type SaveScenarioCommand,
  SaveScenarioCommandSchema,
  ScenarioDetailResponseSchema,
} from '@immersion/contracts/scenarios';

import { apiPost, apiPut } from '../../../shared/api/client';

export function updateScenario(scenarioId: string, command: SaveScenarioCommand) {
  return apiPut(
    `/api/scenarios/${encodeURIComponent(scenarioId)}`,
    command,
    SaveScenarioCommandSchema,
    ScenarioDetailResponseSchema,
  );
}

export function createScenario(command: SaveScenarioCommand) {
  return apiPost('/api/scenarios', command, SaveScenarioCommandSchema, ScenarioDetailResponseSchema);
}
