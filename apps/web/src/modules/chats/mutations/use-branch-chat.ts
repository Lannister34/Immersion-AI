import type { BranchChatCommand, BranchChatResponse } from '@immersion/contracts/chats';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { branchChat } from '../api/branch-chat';
import { chatListQueryKey } from '../queries/chat-list-query';

interface UseBranchChatOptions {
  onSuccess?: (response: BranchChatResponse) => void | Promise<void>;
}

export function useBranchChat(sourceChatId: string, options: UseBranchChatOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (command: BranchChatCommand) => branchChat(sourceChatId, command),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await options.onSuccess?.(response);
    },
  });
}
