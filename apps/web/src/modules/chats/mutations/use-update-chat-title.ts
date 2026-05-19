import type { ChatSessionDto, UpdateChatTitleResponse } from '@immersion/contracts/chats';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateChatTitle } from '../api/update-chat-title';
import { chatListQueryKey } from '../queries/chat-list-query';
import { chatSessionQueryKey } from '../queries/chat-session-query';

interface UpdateChatTitleVariables {
  title: string;
}

interface UpdateChatTitleContext {
  previousSession: ChatSessionDto | undefined;
}

interface UseUpdateChatTitleOptions {
  onSuccess?: (response: UpdateChatTitleResponse) => void | Promise<void>;
}

export function useUpdateChatTitle(chatId: string, options: UseUpdateChatTitleOptions = {}) {
  const queryClient = useQueryClient();
  const sessionKey = chatSessionQueryKey(chatId);

  return useMutation<UpdateChatTitleResponse, Error, UpdateChatTitleVariables, UpdateChatTitleContext>({
    mutationFn: ({ title }) => updateChatTitle(chatId, { title }),
    onMutate: async ({ title }) => {
      await queryClient.cancelQueries({ queryKey: sessionKey });

      const previousSession = queryClient.getQueryData<ChatSessionDto>(sessionKey);
      if (previousSession) {
        queryClient.setQueryData<ChatSessionDto>(sessionKey, {
          ...previousSession,
          chat: { ...previousSession.chat, title },
        });
      }

      return { previousSession };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousSession) {
        queryClient.setQueryData<ChatSessionDto>(sessionKey, context.previousSession);
      }
    },
    onSuccess: async (response) => {
      const cached = queryClient.getQueryData<ChatSessionDto>(sessionKey);
      if (cached) {
        queryClient.setQueryData<ChatSessionDto>(sessionKey, { ...cached, chat: response.chat });
      }
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await options.onSuccess?.(response);
    },
  });
}
