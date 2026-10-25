import type { ChatSessionDto } from '@immersion/contracts/chats';
import {
  type RegenerateChatReplyCommand,
  type StartChatReplyCommand,
  type StartChatReplyGenerationJobResponse,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';

import { ChatNotFoundError } from '../../chats/application/append-chat-messages.js';
import { getChatSession } from '../../chats/application/get-chat-session.js';
import { truncateChatMessages } from '../../chats/application/truncate-chat-messages.js';
import { resolveChatGenerationSettings } from '../../prompting/index.js';
import { resolveGenerationProviderEndpoint } from '../../providers/index.js';
import { getSettingsOverview } from '../../settings/index.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import { completeChatReplyForSession } from './chat-reply-generation.js';
import { planChatReplyRegeneration } from './chat-reply-regeneration.js';
import type { GenerationJobRegistry } from './generation-job-registry.js';

export interface RegenerateChatReplyJobDependencies {
  chatCompletionClient?: ChatCompletionClient;
  generationJobRegistry: GenerationJobRegistry;
  now?: () => Date;
}

async function assertChatReplyCanBeGenerated(session: ChatSessionDto) {
  const endpoint = await resolveGenerationProviderEndpoint();

  resolveChatGenerationSettings(getSettingsOverview(), endpoint.model, session.generationSettings);
}

export async function regenerateChatReplyJob(
  command: RegenerateChatReplyCommand,
  dependencies: RegenerateChatReplyJobDependencies,
): Promise<StartChatReplyGenerationJobResponse> {
  const now = dependencies.now ?? (() => new Date());
  const session = await getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  const regeneration = planChatReplyRegeneration(session);

  await assertChatReplyCanBeGenerated(session);

  const startCommand: StartChatReplyCommand = {
    chatId: command.chatId,
    message: regeneration.userMessage.content,
    mode: 'reply',
  };
  const job = dependencies.generationJobRegistry.createChatReplyJob({
    chatId: command.chatId,
    command: startCommand,
  });
  let sessionAfterTruncate: ChatSessionDto;

  try {
    sessionAfterTruncate = await truncateChatMessages({
      chatId: command.chatId,
      expectedRemovedMessages: regeneration.droppedMessages,
      fromIndex: regeneration.firstDroppedMessageIndex,
      now,
    });
  } catch (error) {
    dependencies.generationJobRegistry.fail(job.id, error);
    throw error;
  }

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
