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

import type { Clock } from '../../../../platform/clock/clock.js';
import { clientDisconnectSignal } from '../../../../platform/http/client-disconnect-signal.js';
import { parseRequest } from '../../../../platform/http/parse-request.js';
import type { TokenCounter } from '../../../prompting/index.js';
import type { ChatCompletionClient } from '../../application/chat-completion-client.js';
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
import type { GenerationJobRegistry } from '../../application/generation-job-registry.js';
import type {
  ChatSessionPort,
  GenerationSettingsSource,
  PromptPlanPort,
  ProviderEndpointResolver,
  ProviderSettingsReader,
  RuntimeEndpointSource,
  VisionSupportProbe,
} from '../../application/generation-ports.js';
import { getGenerationReadiness } from '../../application/get-generation-readiness.js';
import { previewChatReplyPrompt } from '../../application/preview-chat-reply-prompt.js';
import { regenerateChatReplyJob } from '../../application/regenerate-chat-reply-job.js';
import { startChatReplyGenerationJob } from '../../application/start-chat-reply-generation-job.js';
import { GenerationJobRouteParamsSchema, GenerationJobsQuerySchema } from './request-schemas.js';

function writeSseEvent(raw: NodeJS.WritableStream, event: unknown) {
  const parsedEvent = GenerationJobEventSchema.parse(event);

  raw.write(`event: ${parsedEvent.type}\n`);
  raw.write(`data: ${JSON.stringify(parsedEvent)}\n\n`);
}

export interface GenerationRoutesDependencies {
  readonly chatCompletionClient: ChatCompletionClient;
  readonly chats: ChatSessionPort;
  readonly clock: Clock;
  readonly generationJobs: GenerationJobRegistry;
  readonly prompting: PromptPlanPort;
  readonly providers: ProviderEndpointResolver & ProviderSettingsReader;
  readonly runtime: RuntimeEndpointSource;
  readonly settings: GenerationSettingsSource;
  readonly tokenCounter: TokenCounter;
  readonly visionProbe: VisionSupportProbe;
}

export function createGenerationRoutes(dependencies: GenerationRoutesDependencies): FastifyPluginAsync {
  const { generationJobs } = dependencies;

  return async (app) => {
    app.get('/readiness', async () => getGenerationReadiness(dependencies));

    app.post('/chat-reply-preview', async (request) => {
      const command = parseRequest(ChatReplyPromptPreviewCommandSchema, request.body);

      return ChatReplyPromptPreviewResponseSchema.parse(await previewChatReplyPrompt(command, dependencies));
    });

    app.post('/chat-reply', async (request, reply) => {
      const command = parseRequest(StartChatReplyGenerationCommandSchema, request.body);

      return generateChatReply(command, dependencies, { signal: clientDisconnectSignal(reply.raw) });
    });

    app.post('/chat-title', async (request, reply) => {
      const command = parseRequest(GenerateChatTitleCommandSchema, request.body);

      return generateChatTitle(command, dependencies, { signal: clientDisconnectSignal(reply.raw) });
    });

    app.post('/first-message', async (request, reply) => {
      const command = parseRequest(GenerateFirstMessageCommandSchema, request.body);

      return generateFirstMessage(command, dependencies, { signal: clientDisconnectSignal(reply.raw) });
    });

    app.post('/character', async (request, reply) => {
      const command = parseRequest(GenerateCharacterDraftCommandSchema, request.body);

      return generateCharacterDraft(command, dependencies, { signal: clientDisconnectSignal(reply.raw) });
    });

    app.post('/character-field', async (request, reply) => {
      const command = parseRequest(GenerateCharacterFieldCommandSchema, request.body);

      return generateCharacterField(command, dependencies, { signal: clientDisconnectSignal(reply.raw) });
    });

    app.post('/character-avatar-prompt', async (request, reply) => {
      const command = parseRequest(GenerateCharacterAvatarPromptCommandSchema, request.body);

      return generateCharacterAvatarPrompt(command, dependencies, { signal: clientDisconnectSignal(reply.raw) });
    });

    app.post('/scenario', async (request, reply) => {
      const command = parseRequest(GenerateScenarioDraftCommandSchema, request.body);

      return generateScenarioDraft(command, dependencies, { signal: clientDisconnectSignal(reply.raw) });
    });

    app.post('/scenario-first-message', async (request, reply) => {
      const command = parseRequest(GenerateScenarioFirstMessageCommandSchema, request.body);

      return generateScenarioFirstMessage(command, dependencies, { signal: clientDisconnectSignal(reply.raw) });
    });

    app.post('/lorebook', async (request, reply) => {
      const command = parseRequest(GenerateLorebookDraftCommandSchema, request.body);

      return generateLorebookDraft(command, dependencies, { signal: clientDisconnectSignal(reply.raw) });
    });

    app.post('/chat-reply-jobs', async (request, reply) => {
      const command = parseRequest(StartChatReplyGenerationCommandSchema, request.body);
      const response = await startChatReplyGenerationJob(command, dependencies);

      return reply.status(202).send(response);
    });

    app.post('/chat-reply-jobs/regenerate', async (request, reply) => {
      const command = parseRequest(RegenerateChatReplyCommandSchema, request.body);
      const response = await regenerateChatReplyJob(command, dependencies);

      return reply.status(202).send(response);
    });

    app.get('/jobs', async (request) => {
      const query = parseRequest(GenerationJobsQuerySchema, request.query);

      return ListGenerationJobsResponseSchema.parse({
        items: generationJobs.list(query.chatId ? { chatId: query.chatId } : {}),
      });
    });

    app.get('/jobs/:jobId', async (request) => {
      const { jobId } = parseRequest(GenerationJobRouteParamsSchema, request.params);
      const job = generationJobs.get(jobId);

      if (!job) {
        throw new GenerationJobNotFoundError(jobId);
      }

      return GenerationJobResponseSchema.parse({
        job,
      });
    });

    app.post('/jobs/:jobId/cancel', async (request) => {
      const { jobId } = parseRequest(GenerationJobRouteParamsSchema, request.params);
      const job = generationJobs.cancel(jobId);

      if (!job) {
        throw new GenerationJobNotFoundError(jobId);
      }

      return GenerationJobResponseSchema.parse({
        job,
      });
    });

    app.get('/jobs/:jobId/events', async (request, reply) => {
      const { jobId } = parseRequest(GenerationJobRouteParamsSchema, request.params);
      const job = generationJobs.get(jobId);

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

        unsubscribe = generationJobs.subscribe(jobId, writeEvent);
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
}
