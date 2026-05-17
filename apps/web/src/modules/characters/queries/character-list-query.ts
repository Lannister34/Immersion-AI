import { queryOptions } from '@tanstack/react-query';

import { listCharacters } from '../api/list-characters';

export const characterListQueryKey = ['characters', 'list'] as const;

export function characterListQueryOptions() {
  return queryOptions({
    queryKey: characterListQueryKey,
    queryFn: listCharacters,
  });
}
