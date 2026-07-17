import {
  type ChatReplyGenerationResponse,
  ChatReplyGenerationResponseSchema,
  StartChatReplyGenerationCommandSchema,
} from '@immersion/contracts/generation';

import { ChatNotFoundError } from '../../chats/application/append-chat-messages.js';
import { getChatSession } from '../../chats/application/get-chat-session.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import {
  appendUserMessageForChatReply,
  completeChatReplyContinuationForSession,
  completeChatReplyForSession,
} from './chat-reply-generation.js';

export interface GenerateChatReplyDependencies {
  chatCompletionClient?: ChatCompletionClient;
  now?: () => Date;
  signal?: AbortSignal;
}

export async function generateChatReply(
  input: unknown,
  dependencies: GenerateChatReplyDependencies = {},
): Promise<ChatReplyGenerationResponse> {
  const command = StartChatReplyGenerationCommandSchema.parse(input);
  const now = dependencies.now ?? (() => new Date());
  const session = await getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  if (command.mode === 'continue') {
    return ChatReplyGenerationResponseSchema.parse(
      await completeChatReplyContinuationForSession(command, session, dependencies),
    );
  }

  const sessionAfterUserMessage = await appendUserMessageForChatReply(command, now);

  return ChatReplyGenerationResponseSchema.parse(
    await completeChatReplyForSession(command, sessionAfterUserMessage, dependencies),
  );
}
