import type { ChatSessionDto } from '@immersion/contracts/chats';
import {
  RegenerateChatReplyCommandSchema,
  type StartChatReplyCommand,
  type StartChatReplyGenerationJobResponse,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';

import { ChatNotFoundError } from '../../chats/application/append-chat-messages.js';
import { getChatSession } from '../../chats/application/get-chat-session.js';
import { truncateChatMessages } from '../../chats/application/truncate-chat-messages.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import { completeChatReplyForSession } from './chat-reply-generation.js';
import type { GenerationJobRegistry } from './generation-job-registry.js';

export class NoAssistantMessageToRegenerateError extends Error {
  constructor(chatId: string) {
    super(`Chat ${chatId} has no assistant message to regenerate.`);
    this.name = 'NoAssistantMessageToRegenerateError';
  }
}

export interface RegenerateChatReplyJobDependencies {
  chatCompletionClient?: ChatCompletionClient;
  generationJobRegistry: GenerationJobRegistry;
  now?: () => Date;
}

export async function regenerateChatReplyJob(
  input: unknown,
  dependencies: RegenerateChatReplyJobDependencies,
): Promise<StartChatReplyGenerationJobResponse> {
  const command = RegenerateChatReplyCommandSchema.parse(input);
  const now = dependencies.now ?? (() => new Date());
  const session = await getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  // Drop trailing assistant messages until the transcript ends with the prior user message.
  let truncatedSession: ChatSessionDto = session;
  let truncated = false;
  while (truncatedSession.messages.length > 0) {
    const last = truncatedSession.messages.at(-1);
    if (!last || last.role !== 'assistant') {
      break;
    }

    truncatedSession = await truncateChatMessages({
      chatId: command.chatId,
      fromIndex: truncatedSession.messages.length,
      now,
    });
    truncated = true;
  }

  if (!truncated) {
    throw new NoAssistantMessageToRegenerateError(command.chatId);
  }

  const lastUserMessage = truncatedSession.messages.at(-1);
  if (!lastUserMessage || lastUserMessage.role !== 'user') {
    throw new NoAssistantMessageToRegenerateError(command.chatId);
  }

  const startCommand: StartChatReplyCommand = {
    chatId: command.chatId,
    message: lastUserMessage.content,
    mode: 'reply',
  };

  const job = dependencies.generationJobRegistry.createChatReplyJob({
    chatId: command.chatId,
    command: startCommand,
  });
  const sessionAfterTruncate = truncatedSession;

  dependencies.generationJobRegistry.runChatReplyJob(job.id, async ({ publishDelta, signal }) => {
    const response = await completeChatReplyForSession(startCommand, sessionAfterTruncate, {
      ...(dependencies.chatCompletionClient ? { chatCompletionClient: dependencies.chatCompletionClient } : {}),
      now,
      onDelta: publishDelta,
      signal,
    });

    return response.session;
  });

  return StartChatReplyGenerationJobResponseSchema.parse({
    job,
    session: sessionAfterTruncate,
  });
}
