import type { ChatSessionDto } from '@immersion/contracts/chats';
import {
  type ContinueChatReplyCommand,
  StartChatReplyGenerationCommandSchema,
  type StartChatReplyGenerationJobResponse,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';

import { ChatNotFoundError } from '../../chats/application/append-chat-messages.js';
import { getChatSession } from '../../chats/application/get-chat-session.js';
import type { ChatCompletionClient } from './chat-completion-client.js';
import {
  appendUserMessageForChatReply,
  completeChatReplyContinuationForSession,
  completeChatReplyForSession,
  getAnswerableUserMessage,
  getContinuableAssistantMessage,
} from './chat-reply-generation.js';
import type { GenerationJobRegistry } from './generation-job-registry.js';

export interface StartChatReplyGenerationJobDependencies {
  chatCompletionClient?: ChatCompletionClient;
  generationJobRegistry: GenerationJobRegistry;
  now?: () => Date;
}

interface ResolvedJobDependencies {
  chatCompletionClient?: ChatCompletionClient;
  now: () => Date;
}

function startContinueChatReplyJob(
  command: ContinueChatReplyCommand,
  session: ChatSessionDto,
  registry: GenerationJobRegistry,
  dependencies: ResolvedJobDependencies,
): StartChatReplyGenerationJobResponse {
  // Валидация до создания job: нечего продолжать — job не нужен.
  getContinuableAssistantMessage(command.chatId, session);

  const job = registry.createChatReplyJob({
    chatId: command.chatId,
    command,
  });

  registry.runChatReplyJob(job.id, async ({ publishDelta, signal }) => {
    const response = await completeChatReplyContinuationForSession(command, session, {
      ...(dependencies.chatCompletionClient ? { chatCompletionClient: dependencies.chatCompletionClient } : {}),
      now: dependencies.now,
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
  input: unknown,
  dependencies: StartChatReplyGenerationJobDependencies,
): Promise<StartChatReplyGenerationJobResponse> {
  const command = StartChatReplyGenerationCommandSchema.parse(input);
  const now = dependencies.now ?? (() => new Date());
  const session = await getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  if (command.mode === 'continue') {
    return startContinueChatReplyJob(command, session, dependencies.generationJobRegistry, {
      ...(dependencies.chatCompletionClient ? { chatCompletionClient: dependencies.chatCompletionClient } : {}),
      now,
    });
  }

  if (command.mode === 'answer') {
    // Отвечаем на уже сохранённое сообщение пользователя: транскрипт не меняем.
    getAnswerableUserMessage(command.chatId, session);

    const answerJob = dependencies.generationJobRegistry.createChatReplyJob({
      chatId: command.chatId,
      command,
    });

    dependencies.generationJobRegistry.runChatReplyJob(answerJob.id, async ({ publishDelta, signal }) => {
      const response = await completeChatReplyForSession(command, session, {
        ...(dependencies.chatCompletionClient ? { chatCompletionClient: dependencies.chatCompletionClient } : {}),
        now,
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

  const job = dependencies.generationJobRegistry.createChatReplyJob({
    chatId: command.chatId,
    command,
  });
  let sessionAfterUserMessage: ChatSessionDto;

  try {
    sessionAfterUserMessage = await appendUserMessageForChatReply(command, now);
  } catch (error) {
    dependencies.generationJobRegistry.fail(job.id, error);
    throw error;
  }

  dependencies.generationJobRegistry.runChatReplyJob(job.id, async ({ publishDelta, signal }) => {
    const response = await completeChatReplyForSession(command, sessionAfterUserMessage, {
      ...(dependencies.chatCompletionClient ? { chatCompletionClient: dependencies.chatCompletionClient } : {}),
      now,
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
