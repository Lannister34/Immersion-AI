import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useEditorDraftStore } from '../../../shared/drafts/use-editor-draft-store';
import { deleteLorebook } from '../api/delete-lorebook';
import { lorebookDetailQueryKey } from '../queries/lorebook-detail-query';
import { lorebookListQueryKey } from '../queries/lorebook-list-query';

interface UseDeleteLorebookOptions {
  onSuccess?: () => void | Promise<void>;
}

export function useDeleteLorebook(lorebookId: string, options: UseDeleteLorebookOptions = {}) {
  const queryClient = useQueryClient();
  const editorDraftStore = useEditorDraftStore();

  return useMutation({
    mutationFn: () => deleteLorebook(lorebookId),
    onSuccess: async () => {
      editorDraftStore.discard('lorebook', lorebookId);
      queryClient.removeQueries({ queryKey: lorebookDetailQueryKey(lorebookId) });
      await queryClient.invalidateQueries({ queryKey: lorebookListQueryKey });
      await options.onSuccess?.();
    },
  });
}
