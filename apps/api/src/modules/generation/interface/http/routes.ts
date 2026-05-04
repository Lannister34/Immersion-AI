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
import { ZodError, z } from 'zod';

import { ChatMessageNotFoundError, ChatNotFoundError } from '../../../chats/application/append-chat-messages.js';
import { InvalidChatGenerationSettingsResolutionError } from '../../../prompting/application/resolve-chat-generation-settings.js';
import { GenerationProviderUnavailableError } from '../../../providers/application/generation-provider.js';
import { generateChatReply } from '../../application/generate-chat-reply.js';
import { ChatReplyGenerationFailedError, ProviderGenerationError } from '../../application/generation-errors.js';
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

function toProblem(error: unknown) {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: ApiProblemSchema.parse({
        code: 'validation_error',
        message: error.issues[0]?.message ?? 'Invalid request payload.',
      }),
    };
  }

  if (error instanceof ChatNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'chat_not_found',
        message: 'Chat session not found.',
      }),
    };
  }

  if (error instanceof ChatMessageNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'chat_message_not_found',
        message: 'Chat message not found.',
      }),
    };
  }

  if (error instanceof NoAssistantMessageToRegenerateError) {
    return {
      statusCode: 409,
      body: ApiProblemSchema.parse({
        code: 'no_assistant_message_to_regenerate',
        message: 'There is no assistant message to regenerate in this chat.',
      }),
    };
  }

  if (error instanceof GenerationProviderUnavailableError) {
    return {
      statusCode: 409,
      body: ApiProblemSchema.parse({
        code: 'generation_provider_unavailable',
        message: error.message,
      }),
    };
  }

  if (error instanceof InvalidChatGenerationSettingsResolutionError) {
    return {
      statusCode: 409,
      body: ApiProblemSchema.parse({
        code: 'invalid_chat_generation_settings',
        message: error.message,
      }),
    };
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
    return {
      statusCode: 502,
      body: ApiProblemSchema.parse({
        code: 'provider_generation_failed',
        message: error.message,
      }),
    };
  }

  return {
    statusCode: 500,
    body: ApiProblemSchema.parse({
      code: 'internal_error',
      message: 'Unexpected error.',
    }),
  };
}

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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.get('/jobs/:jobId/events', async (request, reply) => {
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

      reply.hijack();
      reply.raw.writeHead(200, {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no',
      });
      writeSseEvent(reply.raw, {
        job,
        type: 'generation.job.snapshot',
      });

      const unsubscribe = generationJobRegistry.subscribe(jobId, (event) => {
        writeSseEvent(reply.raw, event);
      });
      const heartbeat = setInterval(() => {
        reply.raw.write(': keepalive\n\n');
      }, 15_000);
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      request.raw.once('close', cleanup);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to open generation job event stream');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });
};
