import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useEditorDraftStore } from '../../../shared/drafts/use-editor-draft-store';
import { chatListQueryKey } from '../../chats/queries/chat-list-query';
import { deleteCharacter } from '../api/delete-character';
import { characterDetailQueryKey } from '../queries/character-detail-query';
import { characterListQueryKey } from '../queries/character-list-query';

interface UseDeleteCharacterOptions {
  onSuccess?: () => void | Promise<void>;
}

export function useDeleteCharacter(characterId: string, options: UseDeleteCharacterOptions = {}) {
  const queryClient = useQueryClient();
  const editorDraftStore = useEditorDraftStore();

  return useMutation({
    mutationFn: () => deleteCharacter(characterId),
    onSuccess: async () => {
      editorDraftStore.discard('character', characterId);
      queryClient.removeQueries({ queryKey: characterDetailQueryKey(characterId) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: characterListQueryKey }),
        queryClient.invalidateQueries({ queryKey: chatListQueryKey }),
      ]);
      await options.onSuccess?.();
    },
  });
}
