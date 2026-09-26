import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';

import { ProviderGenerationError } from '../../../generation/application/generation-errors.js';
import {
  GenerationProviderUnavailableError,
  resolveGenerationProviderEndpoint,
  testProviderConnection,
} from '../../../providers/index.js';
import {
  createOpenAiChatCompletion,
  type OpenAiChatCompletionResult,
} from '../../application/create-chat-completion.js';
import { OpenAiChatCompletionRequestSchema, UnsupportedOpenAiFeatureError } from '../../domain/openai-contract.js';

interface OpenAiErrorBody {
  error: {
    code: string;
    message: string;
    type: string;
  };
}

function toOpenAiError(error: unknown): { body: OpenAiErrorBody; statusCode: number } {
  if (error instanceof UnsupportedOpenAiFeatureError) {
    return {
      body: { error: { code: 'unsupported_feature', message: error.message, type: 'invalid_request_error' } },
      statusCode: 400,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      body: {
        error: {
          code: 'invalid_request',
          message: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
          type: 'invalid_request_error',
        },
      },
      statusCode: 400,
    };
  }

  if (error instanceof GenerationProviderUnavailableError) {
    return {
      body: { error: { code: 'provider_unavailable', message: error.message, type: 'server_error' } },
      statusCode: 503,
    };
  }

  if (error instanceof ProviderGenerationError) {
    return {
      body: { error: { code: 'provider_failed', message: error.message, type: 'upstream_error' } },
      statusCode: 502,
    };
  }

  return {
    body: {
      error: {
        code: 'internal_error',
        message: error instanceof Error ? error.message : 'Chat completion failed.',
        type: 'server_error',
      },
    },
    statusCode: 500,
  };
}

function toFinishReason(result: OpenAiChatCompletionResult): 'length' | 'stop' {
  return result.content ? 'stop' : 'length';
}

function writeSseData(stream: ServerResponse, payload: unknown) {
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function findConfiguredModel(): Promise<string | null> {
  try {
    return (await resolveGenerationProviderEndpoint()).model;
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

export const openAiCompatRoutes: FastifyPluginAsync = async (app) => {
  app.get('/models', async () => {
    const created = Math.floor(Date.now() / 1000);
    const connection = await testProviderConnection();
    const models = connection.models.map((model) => model.id);

    if (models.length === 0) {
      const configuredModel = await findConfiguredModel();

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
    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const controller = new AbortController();
    let streamOpened = false;
    let deltaCount = 0;

    try {
      const command = OpenAiChatCompletionRequestSchema.parse(request.body);

      if (!command.stream) {
        const result = await createOpenAiChatCompletion(command, { signal: controller.signal });

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
          created,
          id,
          model: result.model,
          object: 'chat.completion',
          usage: {
            completion_tokens: result.usage.completionTokens,
            prompt_tokens: result.usage.promptTokens,
            total_tokens: result.usage.promptTokens + result.usage.completionTokens,
          },
        };
      }

      reply.raw.on('close', () => {
        if (!reply.raw.writableEnded) {
          controller.abort();
        }
      });

      const writeChunk = (delta: Record<string, unknown>, finishReason: string | null = null) => {
        writeSseData(reply.raw, {
          choices: [{ delta, finish_reason: finishReason, index: 0 }],
          created,
          id,
          model: command.model ?? 'immersion',
          object: 'chat.completion.chunk',
        });
      };

      const ensureStream = () => {
        if (streamOpened) {
          return;
        }

        openStream(reply);
        streamOpened = true;
        writeChunk({ content: '', role: 'assistant' });
      };

      const result = await createOpenAiChatCompletion(command, {
        onDelta: (delta, channel) => {
          if (controller.signal.aborted || !reply.raw.writable) {
            return;
          }

          ensureStream();
          deltaCount += 1;
          writeChunk(channel === 'reasoning' ? { reasoning_content: delta } : { content: delta });
        },
        signal: controller.signal,
      });

      ensureStream();

      if (deltaCount === 0 && result.content) {
        writeChunk({ content: result.content });
      }

      writeChunk({}, toFinishReason(result));
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();

      return reply;
    } catch (error) {
      const mapped = toOpenAiError(error);
      request.log.error({ err: error }, 'OpenAI-compatible chat completion failed');

      if (!streamOpened) {
        return reply.status(mapped.statusCode).send(mapped.body);
      }

      writeSseData(reply.raw, mapped.body);
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();

      return reply;
    }
  });
};
