import {
  type ChatReplyGenerationResponse,
  ChatReplyGenerationResponseSchema,
  type StartChatReplyGenerationCommand,
} from '@immersion/contracts/generation';

import { ChatNotFoundError } from '../../chats/index.js';
import {
  appendUserMessageForChatReply,
  type ChatReplyGenerationDependencies,
  completeChatReplyContinuationForSession,
  completeChatReplyForSession,
  getAnswerableUserMessage,
} from './chat-reply-generation.js';
import type { GenerationOptions } from './generation-ports.js';

export async function generateChatReply(
  command: StartChatReplyGenerationCommand,
  dependencies: ChatReplyGenerationDependencies,
  options: GenerationOptions = {},
): Promise<ChatReplyGenerationResponse> {
  const session = await dependencies.chats.getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  if (command.mode === 'continue') {
    return ChatReplyGenerationResponseSchema.parse(
      await completeChatReplyContinuationForSession(command, session, dependencies, options),
    );
  }

  if (command.mode === 'answer') {
    getAnswerableUserMessage(command.chatId, session);

    return ChatReplyGenerationResponseSchema.parse(
      await completeChatReplyForSession(command, session, dependencies, options),
    );
  }

  const sessionAfterUserMessage = await appendUserMessageForChatReply(command, dependencies);

  return ChatReplyGenerationResponseSchema.parse(
    await completeChatReplyForSession(command, sessionAfterUserMessage, dependencies, options),
  );
}
