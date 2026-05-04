import type { ChatMessageMutationResponse } from '@immersion/contracts/chats';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryBaseKey } from '../../generation';
import { deleteChatMessage } from '../api/delete-chat-message';
import { chatListQueryKey } from '../queries/chat-list-query';
import { chatSessionQueryKey } from '../queries/chat-session-query';

interface DeleteChatMessageVariables {
  messageIndex: number;
}

interface UseDeleteChatMessageOptions {
  onSuccess?: (response: ChatMessageMutationResponse) => void | Promise<void>;
}

export function useDeleteChatMessage(chatId: string, options: UseDeleteChatMessageOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageIndex }: DeleteChatMessageVariables) => deleteChatMessage(chatId, messageIndex),
    onSuccess: async (response) => {
      queryClient.setQueryData(chatSessionQueryKey(chatId), response.session);
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await queryClient.invalidateQueries({ queryKey: chatReplyPromptPreviewQueryBaseKey(chatId) });
      await options.onSuccess?.(response);
    },
  });
}
