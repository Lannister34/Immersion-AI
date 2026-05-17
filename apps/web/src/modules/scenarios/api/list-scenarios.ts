import { ScenarioListResponseSchema } from '@immersion/contracts/scenarios';

import { apiGet } from '../../../shared/api/client';

export function listScenarios() {
  return apiGet('/api/scenarios', ScenarioListResponseSchema);
}
