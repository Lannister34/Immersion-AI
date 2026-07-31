import { queryOptions } from '@tanstack/react-query';

import { getScenario } from '../api/get-scenario';

export const scenarioDetailQueryKey = (scenarioId: string) => ['scenarios', 'detail', scenarioId] as const;

export function scenarioDetailQueryOptions(scenarioId: string) {
  return queryOptions({
    queryKey: scenarioDetailQueryKey(scenarioId),
    queryFn: () => getScenario(scenarioId),
  });
}
