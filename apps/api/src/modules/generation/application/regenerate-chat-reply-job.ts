import type { ChatSessionDto } from '@immersion/contracts/chats';
import {
  type RegenerateChatReplyCommand,
  type StartChatReplyCommand,
  type StartChatReplyGenerationJobResponse,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';

import { ChatNotFoundError } from '../../chats/index.js';
import { completeChatReplyForSession } from './chat-reply-generation.js';
import { planChatReplyRegeneration } from './chat-reply-regeneration.js';
import type { ChatSessionPort, PromptPlanPort } from './generation-ports.js';
import type { StartChatReplyGenerationJobDependencies } from './start-chat-reply-generation-job.js';

export interface RegenerateChatReplyJobDependencies extends StartChatReplyGenerationJobDependencies {
  readonly chats: StartChatReplyGenerationJobDependencies['chats'] & Pick<ChatSessionPort, 'truncateChatMessages'>;
  readonly prompting: StartChatReplyGenerationJobDependencies['prompting'] &
    Pick<PromptPlanPort, 'resolveChatGenerationSettings'>;
}

async function assertChatReplyCanBeGenerated(
  session: ChatSessionDto,
  dependencies: RegenerateChatReplyJobDependencies,
): Promise<void> {
  const endpoint = await dependencies.providers.resolveGenerationProviderEndpoint();

  dependencies.prompting.resolveChatGenerationSettings(
    dependencies.settings.getSettingsOverview(),
    endpoint.model,
    session.generationSettings,
  );
}

export async function regenerateChatReplyJob(
  command: RegenerateChatReplyCommand,
  dependencies: RegenerateChatReplyJobDependencies,
): Promise<StartChatReplyGenerationJobResponse> {
  const session = await dependencies.chats.getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  const regeneration = planChatReplyRegeneration(session);

  await assertChatReplyCanBeGenerated(session, dependencies);

  const startCommand: StartChatReplyCommand = {
    chatId: command.chatId,
    message: regeneration.userMessage.content,
    mode: 'reply',
  };
  const job = dependencies.generationJobs.createChatReplyJob({
    chatId: command.chatId,
    command: startCommand,
  });
  let sessionAfterTruncate: ChatSessionDto;

  try {
    sessionAfterTruncate = await dependencies.chats.truncateChatMessages({
      chatId: command.chatId,
      expectedRemovedMessages: regeneration.droppedMessages,
      fromIndex: regeneration.firstDroppedMessageIndex,
      now: () => dependencies.clock.now(),
    });
  } catch (error) {
    dependencies.generationJobs.fail(job.id, error);
    throw error;
  }

  dependencies.generationJobs.runChatReplyJob(job.id, async ({ publishDelta, signal }) => {
    const response = await completeChatReplyForSession(startCommand, sessionAfterTruncate, dependencies, {
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
