import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteChat } from '../api/delete-chat';
import { useChatDraftStore } from '../drafts/use-chat-draft-store';
import { chatListQueryKey } from '../queries/chat-list-query';
import { chatSessionQueryKey } from '../queries/chat-session-query';

interface UseDeleteChatOptions {
  onSuccess?: () => void | Promise<void>;
}

export function useDeleteChat(chatId: string, options: UseDeleteChatOptions = {}) {
  const queryClient = useQueryClient();
  const chatDraftStore = useChatDraftStore();

  return useMutation({
    mutationFn: () => deleteChat(chatId),
    onSuccess: async () => {
      chatDraftStore.discard(chatId);
      queryClient.removeQueries({ queryKey: chatSessionQueryKey(chatId) });
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await options.onSuccess?.();
    },
  });
}
