import type { ChatMessageMutationResponse, ChatSessionDto } from '@immersion/contracts/chats';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryBaseKey } from '../../generation';
import { deleteChatMessage } from '../api/delete-chat-message';
import { chatListQueryKey } from '../queries/chat-list-query';
import { chatSessionQueryKey } from '../queries/chat-session-query';
import { truncateOptimisticMessagesFromIndex } from '../view-models/optimistic-chat-session';

interface DeleteChatMessageVariables {
  messageIndex: number;
}

interface DeleteChatMessageContext {
  previousSession: ChatSessionDto | undefined;
}

interface UseDeleteChatMessageOptions {
  onSuccess?: (response: ChatMessageMutationResponse) => void | Promise<void>;
}

export function useDeleteChatMessage(chatId: string, options: UseDeleteChatMessageOptions = {}) {
  const queryClient = useQueryClient();
  const sessionKey = chatSessionQueryKey(chatId);

  return useMutation<ChatMessageMutationResponse, Error, DeleteChatMessageVariables, DeleteChatMessageContext>({
    mutationFn: ({ messageIndex }) => deleteChatMessage(chatId, messageIndex),
    onMutate: async ({ messageIndex }) => {
      await queryClient.cancelQueries({ queryKey: sessionKey });

      const previousSession = queryClient.getQueryData<ChatSessionDto>(sessionKey);
      if (previousSession) {
        queryClient.setQueryData<ChatSessionDto>(
          sessionKey,
          truncateOptimisticMessagesFromIndex(previousSession, messageIndex, new Date().toISOString()),
        );
      }

      return { previousSession };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousSession) {
        queryClient.setQueryData<ChatSessionDto>(sessionKey, context.previousSession);
      }
    },
    onSuccess: async (response) => {
      queryClient.setQueryData(sessionKey, response.session);
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await queryClient.invalidateQueries({ queryKey: chatReplyPromptPreviewQueryBaseKey(chatId) });
      await options.onSuccess?.(response);
    },
  });
}
