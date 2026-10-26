import type { ChatSessionDto } from '@immersion/contracts/chats';
import {
  type ContinueChatReplyCommand,
  type StartChatReplyGenerationCommand,
  type StartChatReplyGenerationJobResponse,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';

import { ChatNotFoundError } from '../../chats/index.js';
import {
  appendUserMessageForChatReply,
  type ChatReplyGenerationDependencies,
  completeChatReplyContinuationForSession,
  completeChatReplyForSession,
  getAnswerableUserMessage,
  getContinuableAssistantMessage,
} from './chat-reply-generation.js';
import type { GenerationJobRegistry } from './generation-job-registry.js';

export interface StartChatReplyGenerationJobDependencies extends ChatReplyGenerationDependencies {
  readonly generationJobs: GenerationJobRegistry;
}

function startContinueChatReplyJob(
  command: ContinueChatReplyCommand,
  session: ChatSessionDto,
  dependencies: StartChatReplyGenerationJobDependencies,
): StartChatReplyGenerationJobResponse {
  getContinuableAssistantMessage(command.chatId, session);

  const job = dependencies.generationJobs.createChatReplyJob({
    chatId: command.chatId,
    command,
  });

  dependencies.generationJobs.runChatReplyJob(job.id, async ({ publishDelta, signal }) => {
    const response = await completeChatReplyContinuationForSession(command, session, dependencies, {
      onDelta: publishDelta,
      signal,
    });

    return response.session;
  });

  return StartChatReplyGenerationJobResponseSchema.parse({
    job,
    session,
  });
}

export async function startChatReplyGenerationJob(
  command: StartChatReplyGenerationCommand,
  dependencies: StartChatReplyGenerationJobDependencies,
): Promise<StartChatReplyGenerationJobResponse> {
  const session = await dependencies.chats.getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  if (command.mode === 'continue') {
    return startContinueChatReplyJob(command, session, dependencies);
  }

  if (command.mode === 'answer') {
    getAnswerableUserMessage(command.chatId, session);

    const answerJob = dependencies.generationJobs.createChatReplyJob({
      chatId: command.chatId,
      command,
    });

    dependencies.generationJobs.runChatReplyJob(answerJob.id, async ({ publishDelta, signal }) => {
      const response = await completeChatReplyForSession(command, session, dependencies, {
        onDelta: publishDelta,
        signal,
      });

      return response.session;
    });

    return StartChatReplyGenerationJobResponseSchema.parse({
      job: answerJob,
      session,
    });
  }

  const job = dependencies.generationJobs.createChatReplyJob({
    chatId: command.chatId,
    command,
  });
  let sessionAfterUserMessage: ChatSessionDto;

  try {
    sessionAfterUserMessage = await appendUserMessageForChatReply(command, dependencies);
  } catch (error) {
    dependencies.generationJobs.fail(job.id, error);
    throw error;
  }

  dependencies.generationJobs.runChatReplyJob(job.id, async ({ publishDelta, signal }) => {
    const response = await completeChatReplyForSession(command, sessionAfterUserMessage, dependencies, {
      onDelta: publishDelta,
      signal,
    });

    return response.session;
  });

  return StartChatReplyGenerationJobResponseSchema.parse({
    job,
    session: sessionAfterUserMessage,
  });
}
