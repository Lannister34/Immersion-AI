import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteCharacter } from '../api/delete-character';
import { characterDetailQueryKey } from '../queries/character-detail-query';
import { characterListQueryKey } from '../queries/character-list-query';

interface UseDeleteCharacterOptions {
  onSuccess?: () => void | Promise<void>;
}

export function useDeleteCharacter(characterId: string, options: UseDeleteCharacterOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteCharacter(characterId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: characterDetailQueryKey(characterId) });
      await queryClient.invalidateQueries({ queryKey: characterListQueryKey });
      await options.onSuccess?.();
    },
  });
}
