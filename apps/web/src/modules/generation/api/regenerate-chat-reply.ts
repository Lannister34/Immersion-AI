import {
  type RegenerateChatReplyCommand,
  RegenerateChatReplyCommandSchema,
  type StartChatReplyGenerationJobResponse,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';

import { apiPost } from '../../../shared/api/client';

export function regenerateChatReply(command: RegenerateChatReplyCommand): Promise<StartChatReplyGenerationJobResponse> {
  return apiPost(
    '/api/generation/chat-reply-jobs/regenerate',
    command,
    RegenerateChatReplyCommandSchema,
    StartChatReplyGenerationJobResponseSchema,
  );
}
