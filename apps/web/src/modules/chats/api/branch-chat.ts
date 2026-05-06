import {
  type BranchChatCommand,
  BranchChatCommandSchema,
  type BranchChatResponse,
  BranchChatResponseSchema,
} from '@immersion/contracts/chats';

import { apiPost } from '../../../shared/api/client';

export function branchChat(sourceChatId: string, command: BranchChatCommand): Promise<BranchChatResponse> {
  return apiPost(
    `/api/chats/${encodeURIComponent(sourceChatId)}/branch`,
    command,
    BranchChatCommandSchema,
    BranchChatResponseSchema,
  );
}
