import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';

import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import type { Clock } from '../../../../platform/clock/clock.js';
import { parseRequest } from '../../../../platform/http/parse-request.js';
import { installNotFoundHandler, installProblemHandler } from '../../../../platform/http/problem-handler.js';
import { GenerationProviderUnavailableError } from '../../../providers/index.js';
import {
  createOpenAiChatCompletion,
  type OpenAiChatCompletionDependencies,
  type OpenAiChatCompletionResult,
} from '../../application/create-chat-completion.js';
import type { OpenAiCompatProvidersPort } from '../../application/openai-compat-ports.js';
import { OpenAiChatCompletionRequestSchema } from '../../domain/openai-chat-completion-request-schema.js';
import type {
  OpenAiChatCompletionChunk,
  OpenAiChatCompletionDelta,
  OpenAiChatCompletionResponse,
  OpenAiFinishReason,
} from '../../domain/openai-chat-completion-response.js';
import { openAiCompatProblems, toUnexpectedOpenAiProblem } from './openai-compat-problems.js';
import { type OpenAiErrorEnvelope, toOpenAiErrorEnvelope } from './openai-error-envelope.js';

export interface OpenAiCompatRoutesDependencies extends OpenAiChatCompletionDependencies {
  readonly providers: OpenAiCompatProvidersPort;
  readonly clock: Clock;
}

interface CompletionIdentity {
  created: number;
  id: string;
}

function toFinishReason(result: OpenAiChatCompletionResult): OpenAiFinishReason {
  return result.content ? 'stop' : 'length';
}

function toChatCompletionResponse(
  result: OpenAiChatCompletionResult,
  identity: CompletionIdentity,
): OpenAiChatCompletionResponse {
  return {
    choices: [
      {
        finish_reason: toFinishReason(result),
        index: 0,
        message: {
          content: result.content,
          ...(result.reasoning ? { reasoning_content: result.reasoning } : {}),
          role: 'assistant',
        },
      },
    ],
    created: identity.created,
    id: identity.id,
    model: result.model,
    object: 'chat.completion',
    usage: {
      completion_tokens: result.usage.completionTokens,
      prompt_tokens: result.usage.promptTokens,
      total_tokens: result.usage.promptTokens + result.usage.completionTokens,
    },
  };
}

function toChatCompletionChunk(
  identity: CompletionIdentity,
  model: string,
  delta: OpenAiChatCompletionDelta,
  finishReason: OpenAiFinishReason | null,
): OpenAiChatCompletionChunk {
  return {
    choices: [{ delta, finish_reason: finishReason, index: 0 }],
    created: identity.created,
    id: identity.id,
    model,
    object: 'chat.completion.chunk',
  };
}

function writeSseData(stream: ServerResponse, payload: OpenAiChatCompletionChunk | OpenAiErrorEnvelope) {
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function findConfiguredModel(providers: OpenAiCompatProvidersPort): Promise<string | null> {
  try {
    return (await providers.resolveGenerationProviderEndpoint()).model;
  } catch (error) {
    if (error instanceof GenerationProviderUnavailableError) {
      return null;
    }

    throw error;
  }
}

function openStream(reply: FastifyReply) {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream; charset=utf-8',
    'X-Accel-Buffering': 'no',
  });
}

function unixSecondsOf(clock: Clock): number {
  return Math.floor(clock.now().getTime() / 1000);
}

export function createOpenAiCompatRoutes(dependencies: OpenAiCompatRoutesDependencies): FastifyPluginAsync {
  const { clock, providers } = dependencies;

  return async (app) => {
    installProblemHandler(app, {
      render: toOpenAiErrorEnvelope,
      renderUnexpected: toUnexpectedOpenAiProblem,
      table: openAiCompatProblems,
    });
    installNotFoundHandler(app, toOpenAiErrorEnvelope);

    app.get('/models', async () => {
      const created = unixSecondsOf(clock);
      const connection = await providers.testConnection();
      const models = connection.models.map((model) => model.id);

      if (models.length === 0) {
        const configuredModel = await findConfiguredModel(providers);

        if (configuredModel !== null) {
          models.push(configuredModel);
        }
      }

      return {
        data: models.map((id) => ({ created, id, object: 'model', owned_by: 'immersion' })),
        object: 'list',
      };
    });

    app.post('/chat/completions', async (request, reply) => {
      const identity: CompletionIdentity = { created: unixSecondsOf(clock), id: `chatcmpl-${randomUUID()}` };
      const command = parseRequest(OpenAiChatCompletionRequestSchema, request.body);
      const controller = new AbortController();

      if (!command.stream) {
        const result = await createOpenAiChatCompletion(command, dependencies, { signal: controller.signal });

        return toChatCompletionResponse(result, identity);
      }

      let streamOpened = false;
      let deltaCount = 0;

      reply.raw.on('close', () => {
        if (!reply.raw.writableEnded) {
          controller.abort();
        }
      });

      const writeChunk = (
        model: string,
        delta: OpenAiChatCompletionDelta,
        finishReason: OpenAiFinishReason | null = null,
      ) => {
        writeSseData(reply.raw, toChatCompletionChunk(identity, model, delta, finishReason));
      };

      const ensureStream = (model: string) => {
        if (streamOpened) {
          return;
        }

        openStream(reply);
        streamOpened = true;
        writeChunk(model, { content: '', role: 'assistant' });
      };

      try {
        const result = await createOpenAiChatCompletion(command, dependencies, {
          onDelta: (delta, channel, model) => {
            if (controller.signal.aborted || !reply.raw.writable) {
              return;
            }

            ensureStream(model);
            deltaCount += 1;
            writeChunk(model, channel === 'reasoning' ? { reasoning_content: delta } : { content: delta });
          },
          signal: controller.signal,
        });

        ensureStream(result.model);

        if (deltaCount === 0 && result.reasoning) {
          writeChunk(result.model, { reasoning_content: result.reasoning });
        }

        if (deltaCount === 0 && result.content) {
          writeChunk(result.model, { content: result.content });
        }

        writeChunk(result.model, {}, toFinishReason(result));
      } catch (error) {
        if (!streamOpened) {
          throw error;
        }

        request.log.error({ err: error }, 'OpenAI-compatible chat completion failed after its stream opened');
        writeSseData(
          reply.raw,
          toOpenAiErrorEnvelope(openAiCompatProblems.map(error) ?? toUnexpectedOpenAiProblem(error)),
        );
      } finally {
        if (streamOpened) {
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
        }
      }

      return reply;
    });
  };
}
