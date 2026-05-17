import { ScenarioDetailResponseSchema } from '@immersion/contracts/scenarios';

import { apiGet } from '../../../shared/api/client';

export function getScenario(scenarioId: string) {
  return apiGet(`/api/scenarios/${encodeURIComponent(scenarioId)}`, ScenarioDetailResponseSchema);
}
