import type { ChatMessageMutationResponse, ChatSessionDto, UpdateChatMessageCommand } from '@immersion/contracts/chats';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryBaseKey } from '../../generation';
import { updateChatMessage } from '../api/update-chat-message';
import { chatListQueryKey } from '../queries/chat-list-query';
import { chatSessionQueryKey } from '../queries/chat-session-query';
import { replaceOptimisticMessageContent } from '../view-models/optimistic-chat-session';

interface UpdateChatMessageVariables {
  command: UpdateChatMessageCommand;
  messageIndex: number;
}

interface UpdateChatMessageContext {
  previousSession: ChatSessionDto | undefined;
}

interface UseUpdateChatMessageOptions {
  onSuccess?: (response: ChatMessageMutationResponse) => void | Promise<void>;
}

export function useUpdateChatMessage(chatId: string, options: UseUpdateChatMessageOptions = {}) {
  const queryClient = useQueryClient();
  const sessionKey = chatSessionQueryKey(chatId);

  return useMutation<ChatMessageMutationResponse, Error, UpdateChatMessageVariables, UpdateChatMessageContext>({
    mutationFn: ({ command, messageIndex }) => updateChatMessage(chatId, messageIndex, command),
    onMutate: async ({ command, messageIndex }) => {
      await queryClient.cancelQueries({ queryKey: sessionKey });

      const previousSession = queryClient.getQueryData<ChatSessionDto>(sessionKey);
      if (previousSession) {
        queryClient.setQueryData<ChatSessionDto>(
          sessionKey,
          replaceOptimisticMessageContent(previousSession, messageIndex, command.content),
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
