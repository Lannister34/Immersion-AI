import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatListQueryKey } from '../../chats/queries/chat-list-query';
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: characterListQueryKey }),
        // Сводки чатов содержат имя персонажа — иначе оно остаётся в списке после удаления.
        queryClient.invalidateQueries({ queryKey: chatListQueryKey }),
      ]);
      await options.onSuccess?.();
    },
  });
}
