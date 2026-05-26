import type { UpdateChatBindingsCommand, UpdateChatBindingsResponse } from '@immersion/contracts/chats';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryBaseKey } from '../../generation';
import { updateChatBindings } from '../api/update-chat-bindings';
import { chatListQueryKey } from '../queries/chat-list-query';
import { chatSessionQueryKey } from '../queries/chat-session-query';

interface UseUpdateChatBindingsOptions {
  onSuccess?: (response: UpdateChatBindingsResponse) => void | Promise<void>;
}

export function useUpdateChatBindings(chatId: string, options: UseUpdateChatBindingsOptions = {}) {
  const queryClient = useQueryClient();
  const sessionKey = chatSessionQueryKey(chatId);

  return useMutation({
    mutationFn: (command: UpdateChatBindingsCommand) => updateChatBindings(chatId, command),
    onSuccess: async (response) => {
      queryClient.setQueryData(sessionKey, response);
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await queryClient.invalidateQueries({ queryKey: chatReplyPromptPreviewQueryBaseKey(chatId) });
      await options.onSuccess?.(response);
    },
  });
}
