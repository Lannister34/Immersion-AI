import type { ChatSessionDto } from '@immersion/contracts/chats';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryBaseKey } from '../../generation';
import { updateChatLorebooks } from '../api/update-chat-lorebooks';
import { chatListQueryKey } from '../queries/chat-list-query';
import { chatSessionQueryKey } from '../queries/chat-session-query';

interface UseUpdateChatLorebooksOptions {
  onSuccess?: (session: ChatSessionDto) => void | Promise<void>;
}

export function useUpdateChatLorebooks(chatId: string, options: UseUpdateChatLorebooksOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (lorebookIds: string[]) => updateChatLorebooks(chatId, { lorebookIds }),
    onSuccess: async (session) => {
      queryClient.setQueryData(chatSessionQueryKey(chatId), session);
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await queryClient.invalidateQueries({ queryKey: chatReplyPromptPreviewQueryBaseKey(chatId) });
      await options.onSuccess?.(session);
    },
  });
}
