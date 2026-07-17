import { ChatIdSchema } from '@immersion/contracts/chats';
import { ApiProblemSchema } from '@immersion/contracts/common';
import {
  ChatReplyGenerationErrorResponseSchema,
  ChatReplyPromptPreviewCommandSchema,
  ChatReplyPromptPreviewResponseSchema,
  GenerationJobEventSchema,
  GenerationJobIdSchema,
  GenerationJobResponseSchema,
  ListGenerationJobsResponseSchema,
} from '@immersion/contracts/generation';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createToProblem, problem } from '../../../../shared/interface/http/problem.js';
import { ChatMessageNotFoundError, ChatNotFoundError } from '../../../chats/application/append-chat-messages.js';
import { ChatTitleConflictError } from '../../../chats/application/chat-conflicts.js';
import { InvalidChatGenerationSettingsResolutionError } from '../../../prompting/application/resolve-chat-generation-settings.js';
import { GenerationProviderUnavailableError } from '../../../providers/application/generation-provider.js';
import { generateCharacterAvatarPrompt } from '../../application/generate-character-avatar-prompt.js';
import { generateCharacterDraft } from '../../application/generate-character-draft.js';
import { generateCharacterField } from '../../application/generate-character-field.js';
import { generateChatReply } from '../../application/generate-chat-reply.js';
import { generateChatTitle } from '../../application/generate-chat-title.js';
import { generateFirstMessage } from '../../application/generate-first-message.js';
import { generateLorebookDraft } from '../../application/generate-lorebook-draft.js';
import { generateScenarioDraft } from '../../application/generate-scenario-draft.js';
import { generateScenarioFirstMessage } from '../../application/generate-scenario-first-message.js';
import {
  ChatNotEmptyError,
  ChatReplyGenerationFailedError,
  ChatTranscriptEmptyError,
  NothingToContinueError,
  ProviderGenerationError,
} from '../../application/generation-errors.js';
import { ActiveGenerationJobExistsError } from '../../application/generation-job-registry.js';
import { getGenerationReadiness } from '../../application/get-generation-readiness.js';
import { previewChatReplyPrompt } from '../../application/preview-chat-reply-prompt.js';
import {
  NoAssistantMessageToRegenerateError,
  regenerateChatReplyJob,
} from '../../application/regenerate-chat-reply-job.js';
import { startChatReplyGenerationJob } from '../../application/start-chat-reply-generation-job.js';
import { InMemoryGenerationJobRegistry } from '../../infrastructure/in-memory-generation-job-registry.js';

const GenerationJobRouteParamsSchema = z.object({
  jobId: GenerationJobIdSchema,
});

const GenerationJobsQuerySchema = z.object({
  chatId: ChatIdSchema.optional(),
});

const toProblem = createToProblem((error) => {
  if (error instanceof ChatNotFoundError) {
    return problem(404, 'chat_not_found', 'Chat session not found.');
  }

  if (error instanceof ChatMessageNotFoundError) {
    return problem(404, 'chat_message_not_found', 'Chat message not found.');
  }

  if (error instanceof NoAssistantMessageToRegenerateError) {
    return problem(
      409,
      'no_assistant_message_to_regenerate',
      'There is no assistant message to regenerate in this chat.',
    );
  }

  if (error instanceof NothingToContinueError) {
    return problem(
      409,
      'nothing_to_continue',
      'Продолжать нечего: последнее сообщение в чате должно быть непустым ответом персонажа.',
    );
  }

  if (error instanceof ChatTranscriptEmptyError) {
    return problem(409, 'chat_empty', error.message);
  }

  if (error instanceof ChatNotEmptyError) {
    return problem(409, 'chat_not_empty', error.message);
  }

  if (error instanceof ChatTitleConflictError) {
    return problem(409, 'chat_title_conflict', 'Chat was renamed while the title was being generated.');
  }

  if (error instanceof GenerationProviderUnavailableError) {
    return problem(409, 'generation_provider_unavailable', error.message);
  }

  if (error instanceof InvalidChatGenerationSettingsResolutionError) {
    return problem(409, 'invalid_chat_generation_settings', error.message);
  }

  if (error instanceof ActiveGenerationJobExistsError) {
    return {
      statusCode: 409,
      body: {
        ...ApiProblemSchema.parse({
          code: 'active_generation_job_exists',
          message: 'An active generation job already exists for this chat.',
        }),
        job: error.job,
      },
    };
  }

  if (error instanceof ChatReplyGenerationFailedError) {
    return {
      statusCode: error.statusCode,
      body: ChatReplyGenerationErrorResponseSchema.parse({
        code: error.code,
        message: error.message,
        session: error.session,
      }),
    };
  }

  if (error instanceof ProviderGenerationError) {
    return problem(502, 'provider_generation_failed', error.message);
  }

  return null;
});

function writeSseEvent(raw: NodeJS.WritableStream, event: unknown) {
  const parsedEvent = GenerationJobEventSchema.parse(event);

  raw.write(`event: ${parsedEvent.type}\n`);
  raw.write(`data: ${JSON.stringify(parsedEvent)}\n\n`);
}

export const generationRoutes: FastifyPluginAsync = async (app) => {
  const generationJobRegistry = new InMemoryGenerationJobRegistry();

  app.get('/readiness', async () => getGenerationReadiness());

  app.post('/chat-reply-preview', async (request, reply) => {
    try {
      const command = ChatReplyPromptPreviewCommandSchema.parse(request.body);

      return ChatReplyPromptPreviewResponseSchema.parse(await previewChatReplyPrompt(command));
    } catch (error) {
      request.log.error({ err: error }, 'Failed to preview chat reply prompt');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/chat-reply', async (request, reply) => {
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateChatReply(request.body, {
        signal: abortController.signal,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate chat reply');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/chat-title', async (request, reply) => {
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateChatTitle(request.body, {
        signal: abortController.signal,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate chat title');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/first-message', async (request, reply) => {
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateFirstMessage(request.body, {
        signal: abortController.signal,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate first message');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/character', async (request, reply) => {
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateCharacterDraft(request.body, {
        signal: abortController.signal,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate character draft');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/character-field', async (request, reply) => {
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateCharacterField(request.body, {
        signal: abortController.signal,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate character field');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/character-avatar-prompt', async (request, reply) => {
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateCharacterAvatarPrompt(request.body, {
        signal: abortController.signal,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate character avatar prompt');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/scenario', async (request, reply) => {
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateScenarioDraft(request.body, {
        signal: abortController.signal,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate scenario draft');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/scenario-first-message', async (request, reply) => {
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateScenarioFirstMessage(request.body, {
        signal: abortController.signal,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate scenario first message');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/lorebook', async (request, reply) => {
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateLorebookDraft(request.body, {
        signal: abortController.signal,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate lorebook draft');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/chat-reply-jobs', async (request, reply) => {
    try {
      const response = await startChatReplyGenerationJob(request.body, {
        generationJobRegistry,
      });

      return reply.status(202).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to start chat reply generation job');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/chat-reply-jobs/regenerate', async (request, reply) => {
    try {
      const response = await regenerateChatReplyJob(request.body, {
        generationJobRegistry,
      });

      return reply.status(202).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to regenerate chat reply');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/jobs', async (request, reply) => {
    try {
      const query = GenerationJobsQuerySchema.parse(request.query);

      return ListGenerationJobsResponseSchema.parse({
        items: generationJobRegistry.list(query.chatId ? { chatId: query.chatId } : {}),
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list generation jobs');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/jobs/:jobId', async (request, reply) => {
    try {
      const { jobId } = GenerationJobRouteParamsSchema.parse(request.params);
      const job = generationJobRegistry.get(jobId);

      if (!job) {
        return reply.status(404).send(
          ApiProblemSchema.parse({
            code: 'generation_job_not_found',
            message: 'Generation job not found.',
          }),
        );
      }

      return GenerationJobResponseSchema.parse({
        job,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load generation job');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/jobs/:jobId/cancel', async (request, reply) => {
    try {
      const { jobId } = GenerationJobRouteParamsSchema.parse(request.params);
      const job = generationJobRegistry.cancel(jobId);

      if (!job) {
        return reply.status(404).send(
          ApiProblemSchema.parse({
            code: 'generation_job_not_found',
            message: 'Generation job not found.',
          }),
        );
      }

      return GenerationJobResponseSchema.parse({
        job,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to cancel generation job');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/jobs/:jobId/events', async (request, reply) => {
    let hijacked = false;

    try {
      const { jobId } = GenerationJobRouteParamsSchema.parse(request.params);
      const job = generationJobRegistry.get(jobId);

      if (!job) {
        return reply.status(404).send(
          ApiProblemSchema.parse({
            code: 'generation_job_not_found',
            message: 'Generation job not found.',
          }),
        );
      }

      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;
      let closed = false;
      const cleanup = () => {
        if (closed) {
          return;
        }

        closed = true;

        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }

        unsubscribe?.();
        unsubscribe = null;
      };

      // Register the close handler before the first write so an immediately
      // dropped connection still releases the subscription and heartbeat.
      request.raw.once('close', cleanup);

      reply.hijack();
      hijacked = true;
      reply.raw.writeHead(200, {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no',
      });

      const writeEvent = (event: unknown) => {
        if (closed || !reply.raw.writable) {
          cleanup();
          return;
        }

        try {
          writeSseEvent(reply.raw, event);
        } catch (error) {
          request.log.warn({ err: error }, 'Failed to write generation job event; closing stream');
          cleanup();
        }
      };

      writeEvent({
        job,
        type: 'generation.job.snapshot',
      });

      if (closed) {
        return;
      }

      unsubscribe = generationJobRegistry.subscribe(jobId, writeEvent);
      heartbeat = setInterval(() => {
        if (closed || !reply.raw.writable) {
          cleanup();
          return;
        }

        reply.raw.write(': keepalive\n\n');
      }, 15_000);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to open generation job event stream');

      if (hijacked) {
        // After hijack the reply object no longer owns the response; the raw
        // socket is all we can close.
        reply.raw.end();
        return;
      }

      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
};
