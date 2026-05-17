import { apiDeleteNoContent } from '../../../shared/api/client';

export function deleteScenario(scenarioId: string): Promise<void> {
  return apiDeleteNoContent(`/api/scenarios/${encodeURIComponent(scenarioId)}`);
}
