import { queryOptions } from '@tanstack/react-query';

import { listScenarios } from '../api/list-scenarios';

export const scenarioListQueryKey = ['scenarios', 'list'] as const;

export function scenarioListQueryOptions() {
  return queryOptions({
    queryKey: scenarioListQueryKey,
    queryFn: listScenarios,
  });
}
