import type {
  UpdateChatGenerationSettingsCommand,
  UpdateChatGenerationSettingsResponse,
} from '@immersion/contracts/chats';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { chatReplyPromptPreviewQueryBaseKey } from '../../generation';
import { updateChatGenerationSettings } from '../api/update-chat-generation-settings';
import { chatListQueryKey } from '../queries/chat-list-query';
import { chatSessionQueryKey } from '../queries/chat-session-query';

interface UseUpdateChatGenerationSettingsOptions {
  onSuccess?: (session: UpdateChatGenerationSettingsResponse) => void | Promise<void>;
}

export function useUpdateChatGenerationSettings(chatId: string, options: UseUpdateChatGenerationSettingsOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (command: UpdateChatGenerationSettingsCommand) => updateChatGenerationSettings(chatId, command),
    onSuccess: async (session) => {
      queryClient.setQueryData(chatSessionQueryKey(chatId), session);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatSessionQueryKey(chatId) }),
        queryClient.invalidateQueries({ queryKey: chatListQueryKey }),
        queryClient.invalidateQueries({ queryKey: chatReplyPromptPreviewQueryBaseKey(chatId) }),
      ]);
      await options.onSuccess?.(session);
    },
  });
}
