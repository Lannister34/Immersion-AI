import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { GenerateChatTitleResponse } from '@immersion/contracts/generation';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../../shared/api/client';
import { chatListQueryKey } from '../../chats/queries/chat-list-query';
import { chatSessionQueryKey } from '../../chats/queries/chat-session-query';
import { generateChatTitle } from '../api/generate-chat-title';

export function useGenerateChatTitle(chatId: string) {
  const queryClient = useQueryClient();
  const sessionKey = chatSessionQueryKey(chatId);

  return useMutation<GenerateChatTitleResponse, Error>({
    mutationFn: () => generateChatTitle(chatId),
    onSuccess: async (response) => {
      const cached = queryClient.getQueryData<ChatSessionDto>(sessionKey);
      if (cached) {
        queryClient.setQueryData<ChatSessionDto>(sessionKey, { ...cached, chat: response.chat });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionKey }),
        queryClient.invalidateQueries({ queryKey: chatListQueryKey }),
      ]);
    },
    onError: async (error) => {
      // При конфликте показываем актуальное (ручное) название.
      if (error instanceof ApiError && error.code === 'chat_title_conflict') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: sessionKey }),
          queryClient.invalidateQueries({ queryKey: chatListQueryKey }),
        ]);
      }
    },
  });
}
