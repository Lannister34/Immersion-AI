import { queryOptions } from '@tanstack/react-query';

import { getRuntimeLogs } from '../api/get-runtime-logs';

export const runtimeLogsQueryKey = ['runtime', 'logs'] as const;

export function runtimeLogsQueryOptions() {
  return queryOptions({
    queryKey: runtimeLogsQueryKey,
    queryFn: getRuntimeLogs,
  });
}
