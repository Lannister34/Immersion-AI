import { queryOptions } from '@tanstack/react-query';

import { getCharacter } from '../api/get-character';

export const characterDetailQueryKey = (characterId: string) => ['characters', 'detail', characterId] as const;

export function characterDetailQueryOptions(characterId: string) {
  return queryOptions({
    queryKey: characterDetailQueryKey(characterId),
    queryFn: () => getCharacter(characterId),
  });
}
