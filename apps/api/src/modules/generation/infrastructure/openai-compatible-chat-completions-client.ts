import { splitReply } from '@immersion/domain/generation';
import { z } from 'zod';

import { resolveChatCompletionsUrl } from '../../providers/application/generation-provider.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { ProviderGenerationError } from '../application/generation-errors.js';
import { buildRequestSignal, isAbortError, readProviderErrorText } from './provider-http.js';
import { type ProviderStreamSink, readProviderReply } from './provider-reply-reader.js';

const OpenAiCompatibleStreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullable().optional(),
            reasoning: z.string().nullable().optional(),
            reasoning_content: z.string().nullable().optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});

const OpenAiCompatibleStreamErrorSchema = z.object({
  error: z.union([z.string(), z.object({ message: z.string().optional() })]),
});

const OpenAiCompatibleChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          reasoning: z.string().nullable().optional(),
          reasoning_content: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

function buildMessagePayload(message: ChatCompletionRequest['messages'][number]) {
  if (!message.images || message.images.length === 0) {
    return { content: message.content, role: message.role };
  }

  return {
    content: [
      ...(message.content.trim().length > 0 ? [{ text: message.content, type: 'text' as const }] : []),
      ...message.images.map((url) => ({ image_url: { url }, type: 'image_url' as const })),
    ],
    role: message.role,
  };
}

function buildHeaders(apiKey: string | null) {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function readOpenAiStreamData(data: string, sink: ProviderStreamSink) {
  if (data === '[DONE]') {
    return;
  }

  const chunk: unknown = JSON.parse(data);
  const streamError = OpenAiCompatibleStreamErrorSchema.safeParse(chunk);

  if (streamError.success) {
    const { error } = streamError.data;

    throw new ProviderGenerationError(
      (typeof error === 'string' ? error : error.message) || 'Provider stream reported an error.',
    );
  }

  const parsed = OpenAiCompatibleStreamChunkSchema.safeParse(chunk);

  if (!parsed.success) {
    return;
  }

  const delta = parsed.data.choices[0]?.delta;
  const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning ?? '';

  if (reasoningDelta.length > 0) {
    sink.reasoning(reasoningDelta);
  }

  const contentDelta = delta?.content ?? '';

  if (contentDelta.length > 0) {
    sink.reply(contentDelta);
  }
}

async function readOpenAiJsonReply(response: Response): Promise<ChatCompletionResponse> {
  const responseText = await response.text();
  let payload: z.infer<typeof OpenAiCompatibleChatCompletionResponseSchema>;

  try {
    payload = OpenAiCompatibleChatCompletionResponseSchema.parse(JSON.parse(responseText));
  } catch (error) {
    throw new ProviderGenerationError(
      error instanceof Error
        ? `Provider returned an invalid response: ${error.message}`
        : 'Provider returned an invalid response.',
    );
  }

  const message = payload.choices[0]?.message;
  const split = splitReply(message?.content ?? '');
  const reasoning = [message?.reasoning_content ?? message?.reasoning ?? '', split.reasoning]
    .filter((part) => part.trim().length > 0)
    .join('\n\n')
    .trim();

  return {
    content: split.content,
    reasoning,
  };
}

const OPENAI_REASONING_MODEL_PATTERNS = [/^o\d/u, /^gpt-5/u];

function buildGenerationPayload(request: ChatCompletionRequest) {
  if (request.endpoint.apiKind !== 'openai-cloud') {
    return {
      max_tokens: request.maxTokens,
      min_p: request.sampling.minP,
      presence_penalty: request.sampling.presencePenalty,
      rep_pen: request.sampling.repeatPenalty,
      rep_pen_range: request.sampling.repeatPenaltyRange,
      temperature: request.sampling.temperature,
      top_k: request.sampling.topK,
      top_p: request.sampling.topP,
    };
  }

  const isReasoningModel = OPENAI_REASONING_MODEL_PATTERNS.some((pattern) => pattern.test(request.endpoint.model));

  return {
    max_completion_tokens: request.maxTokens,
    ...(isReasoningModel
      ? {}
      : {
          presence_penalty: request.sampling.presencePenalty,
          temperature: request.sampling.temperature,
          top_p: request.sampling.topP,
        }),
  };
}

function buildServerExtensions(request: ChatCompletionRequest) {
  if (request.endpoint.apiKind !== 'openai-compatible' || !request.serverExtensions) {
    return {};
  }

  return request.serverExtensions;
}

export class OpenAiCompatibleChatCompletionsClient implements ChatCompletionClient {
  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const streaming = Boolean(request.onDelta);
    let response: Response;

    try {
      response = await fetch(resolveChatCompletionsUrl(request.endpoint), {
        method: 'POST',
        headers: buildHeaders(request.endpoint.apiKey),
        body: JSON.stringify({
          ...buildServerExtensions(request),
          model: request.endpoint.model,
          messages: request.messages.map(buildMessagePayload),
          stream: streaming,
          ...buildGenerationPayload(request),
        }),
        signal: buildRequestSignal(request.signal),
      });
    } catch (error) {
      if (request.signal?.aborted || isAbortError(error)) {
        throw error;
      }

      throw new ProviderGenerationError(error instanceof Error ? error.message : 'Provider request failed.');
    }

    if (!response.ok) {
      throw new ProviderGenerationError(
        `Provider returned HTTP ${response.status}${await readProviderErrorText(response)}`,
      );
    }

    return readProviderReply(response, request, {
      readJson: readOpenAiJsonReply,
      readStreamData: readOpenAiStreamData,
    });
  }
}
