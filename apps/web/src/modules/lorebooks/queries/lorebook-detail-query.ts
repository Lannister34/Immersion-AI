import { queryOptions } from '@tanstack/react-query';

import { getLorebook } from '../api/get-lorebook';

export const lorebookDetailQueryKey = (lorebookId: string) => ['lorebooks', 'detail', lorebookId] as const;

export function lorebookDetailQueryOptions(lorebookId: string) {
  return queryOptions({
    queryKey: lorebookDetailQueryKey(lorebookId),
    queryFn: () => getLorebook(lorebookId),
  });
}
