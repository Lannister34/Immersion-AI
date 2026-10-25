import {
  ChatReplyPromptPreviewCommandSchema,
  ChatReplyPromptPreviewResponseSchema,
  GenerateCharacterAvatarPromptCommandSchema,
  GenerateCharacterDraftCommandSchema,
  GenerateCharacterFieldCommandSchema,
  GenerateChatTitleCommandSchema,
  GenerateFirstMessageCommandSchema,
  GenerateLorebookDraftCommandSchema,
  GenerateScenarioDraftCommandSchema,
  GenerateScenarioFirstMessageCommandSchema,
  GenerationJobEventSchema,
  GenerationJobResponseSchema,
  ListGenerationJobsResponseSchema,
  RegenerateChatReplyCommandSchema,
  StartChatReplyGenerationCommandSchema,
} from '@immersion/contracts/generation';
import type { FastifyPluginAsync } from 'fastify';

import { parseRequest } from '../../../../platform/http/parse-request.js';
import { generateCharacterAvatarPrompt } from '../../application/generate-character-avatar-prompt.js';
import { generateCharacterDraft } from '../../application/generate-character-draft.js';
import { generateCharacterField } from '../../application/generate-character-field.js';
import { generateChatReply } from '../../application/generate-chat-reply.js';
import { generateChatTitle } from '../../application/generate-chat-title.js';
import { generateFirstMessage } from '../../application/generate-first-message.js';
import { generateLorebookDraft } from '../../application/generate-lorebook-draft.js';
import { generateScenarioDraft } from '../../application/generate-scenario-draft.js';
import { generateScenarioFirstMessage } from '../../application/generate-scenario-first-message.js';
import { GenerationJobNotFoundError } from '../../application/generation-errors.js';
import { getGenerationReadiness } from '../../application/get-generation-readiness.js';
import { previewChatReplyPrompt } from '../../application/preview-chat-reply-prompt.js';
import { regenerateChatReplyJob } from '../../application/regenerate-chat-reply-job.js';
import { startChatReplyGenerationJob } from '../../application/start-chat-reply-generation-job.js';
import { InMemoryGenerationJobRegistry } from '../../infrastructure/in-memory-generation-job-registry.js';
import { GenerationJobRouteParamsSchema, GenerationJobsQuerySchema } from './request-schemas.js';

function writeSseEvent(raw: NodeJS.WritableStream, event: unknown) {
  const parsedEvent = GenerationJobEventSchema.parse(event);

  raw.write(`event: ${parsedEvent.type}\n`);
  raw.write(`data: ${JSON.stringify(parsedEvent)}\n\n`);
}

export const generationRoutes: FastifyPluginAsync = async (app) => {
  const generationJobRegistry = new InMemoryGenerationJobRegistry();

  app.get('/readiness', async () => getGenerationReadiness());

  app.post('/chat-reply-preview', async (request) => {
    const command = parseRequest(ChatReplyPromptPreviewCommandSchema, request.body);

    return ChatReplyPromptPreviewResponseSchema.parse(await previewChatReplyPrompt(command));
  });

  app.post('/chat-reply', async (request) => {
    const command = parseRequest(StartChatReplyGenerationCommandSchema, request.body);
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateChatReply(command, {
        signal: abortController.signal,
      });
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/chat-title', async (request) => {
    const command = parseRequest(GenerateChatTitleCommandSchema, request.body);
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateChatTitle(command, {
        signal: abortController.signal,
      });
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/first-message', async (request) => {
    const command = parseRequest(GenerateFirstMessageCommandSchema, request.body);
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateFirstMessage(command, {
        signal: abortController.signal,
      });
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/character', async (request) => {
    const command = parseRequest(GenerateCharacterDraftCommandSchema, request.body);
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateCharacterDraft(command, {
        signal: abortController.signal,
      });
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/character-field', async (request) => {
    const command = parseRequest(GenerateCharacterFieldCommandSchema, request.body);
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateCharacterField(command, {
        signal: abortController.signal,
      });
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/character-avatar-prompt', async (request) => {
    const command = parseRequest(GenerateCharacterAvatarPromptCommandSchema, request.body);
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateCharacterAvatarPrompt(command, {
        signal: abortController.signal,
      });
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/scenario', async (request) => {
    const command = parseRequest(GenerateScenarioDraftCommandSchema, request.body);
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateScenarioDraft(command, {
        signal: abortController.signal,
      });
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/scenario-first-message', async (request) => {
    const command = parseRequest(GenerateScenarioFirstMessageCommandSchema, request.body);
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateScenarioFirstMessage(command, {
        signal: abortController.signal,
      });
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/lorebook', async (request) => {
    const command = parseRequest(GenerateLorebookDraftCommandSchema, request.body);
    const abortController = new AbortController();
    const abortGeneration = () => abortController.abort();

    request.raw.once('aborted', abortGeneration);

    try {
      return await generateLorebookDraft(command, {
        signal: abortController.signal,
      });
    } finally {
      request.raw.off('aborted', abortGeneration);
    }
  });

  app.post('/chat-reply-jobs', async (request, reply) => {
    const command = parseRequest(StartChatReplyGenerationCommandSchema, request.body);
    const response = await startChatReplyGenerationJob(command, {
      generationJobRegistry,
    });

    return reply.status(202).send(response);
  });

  app.post('/chat-reply-jobs/regenerate', async (request, reply) => {
    const command = parseRequest(RegenerateChatReplyCommandSchema, request.body);
    const response = await regenerateChatReplyJob(command, {
      generationJobRegistry,
    });

    return reply.status(202).send(response);
  });

  app.get('/jobs', async (request) => {
    const query = parseRequest(GenerationJobsQuerySchema, request.query);

    return ListGenerationJobsResponseSchema.parse({
      items: generationJobRegistry.list(query.chatId ? { chatId: query.chatId } : {}),
    });
  });

  app.get('/jobs/:jobId', async (request) => {
    const { jobId } = parseRequest(GenerationJobRouteParamsSchema, request.params);
    const job = generationJobRegistry.get(jobId);

    if (!job) {
      throw new GenerationJobNotFoundError(jobId);
    }

    return GenerationJobResponseSchema.parse({
      job,
    });
  });

  app.post('/jobs/:jobId/cancel', async (request) => {
    const { jobId } = parseRequest(GenerationJobRouteParamsSchema, request.params);
    const job = generationJobRegistry.cancel(jobId);

    if (!job) {
      throw new GenerationJobNotFoundError(jobId);
    }

    return GenerationJobResponseSchema.parse({
      job,
    });
  });

  app.get('/jobs/:jobId/events', async (request, reply) => {
    const { jobId } = parseRequest(GenerationJobRouteParamsSchema, request.params);
    const job = generationJobRegistry.get(jobId);

    if (!job) {
      throw new GenerationJobNotFoundError(jobId);
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

    request.raw.once('close', cleanup);

    reply.hijack();

    try {
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
      reply.raw.end();
    }
  });
};
