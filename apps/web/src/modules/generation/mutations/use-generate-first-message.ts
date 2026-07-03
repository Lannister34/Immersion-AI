import type { GenerateFirstMessageResponse } from '@immersion/contracts/generation';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatListQueryKey } from '../../chats/queries/chat-list-query';
import { chatSessionQueryKey } from '../../chats/queries/chat-session-query';
import { generateFirstMessage } from '../api/generate-first-message';

export function useGenerateFirstMessage(chatId: string) {
  const queryClient = useQueryClient();
  const sessionKey = chatSessionQueryKey(chatId);

  return useMutation<GenerateFirstMessageResponse, Error>({
    mutationFn: () => generateFirstMessage(chatId),
    onSuccess: async (response) => {
      // Не затираем кэш, если пока шла генерация в нём уже появились сообщения
      // (например, пользователь успел отправить своё в другой вкладке).
      queryClient.setQueryData<GenerateFirstMessageResponse['session']>(sessionKey, (current) =>
        current === undefined || current.messages.length === 0 ? response.session : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionKey }),
        queryClient.invalidateQueries({ queryKey: chatListQueryKey }),
      ]);
    },
  });
}
