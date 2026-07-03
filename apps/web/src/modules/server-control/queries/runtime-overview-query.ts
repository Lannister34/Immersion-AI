import { queryOptions } from '@tanstack/react-query';

import { getRuntimeOverview } from '../api/get-runtime-overview';

export const runtimeOverviewQueryKey = ['runtime', 'overview'] as const;

export function runtimeOverviewQueryOptions() {
  return queryOptions({
    queryKey: runtimeOverviewQueryKey,
    queryFn: getRuntimeOverview,
  });
}
