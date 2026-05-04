import type { ChatMessageMutationResponse, UpdateChatMessageCommand } from '@immersion/contracts/chats';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryBaseKey } from '../../generation';
import { updateChatMessage } from '../api/update-chat-message';
import { chatListQueryKey } from '../queries/chat-list-query';
import { chatSessionQueryKey } from '../queries/chat-session-query';

interface UpdateChatMessageVariables {
  command: UpdateChatMessageCommand;
  messageIndex: number;
}

interface UseUpdateChatMessageOptions {
  onSuccess?: (response: ChatMessageMutationResponse) => void | Promise<void>;
}

export function useUpdateChatMessage(chatId: string, options: UseUpdateChatMessageOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ command, messageIndex }: UpdateChatMessageVariables) =>
      updateChatMessage(chatId, messageIndex, command),
    onSuccess: async (response) => {
      queryClient.setQueryData(chatSessionQueryKey(chatId), response.session);
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await queryClient.invalidateQueries({ queryKey: chatReplyPromptPreviewQueryBaseKey(chatId) });
      await options.onSuccess?.(response);
    },
  });
}
