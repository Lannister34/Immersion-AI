import { queryOptions } from '@tanstack/react-query';

import { listLorebooks } from '../api/list-lorebooks';

export const lorebookListQueryKey = ['lorebooks', 'list'] as const;

export function lorebookListQueryOptions() {
  return queryOptions({
    queryKey: lorebookListQueryKey,
    queryFn: listLorebooks,
  });
}
