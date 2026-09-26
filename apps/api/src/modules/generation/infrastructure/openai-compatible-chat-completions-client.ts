import { createReplySplitter, type ReplyChannel, type ReplyChunk, splitReply } from '@immersion/domain/generation';
import { z } from 'zod';

import { resolveChatCompletionsUrl } from '../../providers/application/generation-provider.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { ProviderGenerationError } from '../application/generation-errors.js';
import { buildRequestSignal, isAbortError, readProviderErrorText } from './provider-http.js';

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

/**
 * OpenAI-совместимый формат картинок: вместо строки в content уходит массив
 * частей. Для текстовых сообщений оставляем строку — так же, как раньше, и
 * серверы без мультимодальности ничего нового не видят.
 */
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

async function readStreamedContent(
  response: Response,
  onDelta: (delta: string, channel: ReplyChannel) => void,
): Promise<ChatCompletionResponse> {
  const body = response.body;

  if (!body) {
    throw new ProviderGenerationError('Provider returned an empty stream.');
  }

  const decoder = new TextDecoder();
  const reader = body.getReader();
  const splitter = createReplySplitter();
  const collected: Record<ReplyChannel, string> = { reasoning: '', reply: '' };
  let buffer = '';

  const emit = (chunks: ReplyChunk[]) => {
    for (const chunk of chunks) {
      collected[chunk.channel] += chunk.text;
      onDelta(chunk.text, chunk.channel);
    }
  };

  const handleLine = (line: string) => {
    const trimmed = line.trim();

    if (!trimmed.startsWith('data:')) {
      return;
    }

    const payload = trimmed.slice('data:'.length).trim();

    if (payload === '[DONE]') {
      return;
    }

    const parsed = OpenAiCompatibleStreamChunkSchema.safeParse(JSON.parse(payload));

    if (!parsed.success) {
      return;
    }

    const delta = parsed.data.choices[0]?.delta;
    const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning ?? '';

    if (reasoningDelta.length > 0) {
      emit([{ channel: 'reasoning', text: reasoningDelta }]);
    }

    const contentDelta = delta?.content ?? '';

    if (contentDelta.length > 0) {
      emit(splitter.push(contentDelta));
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      handleLine(line);
    }
  }

  if (buffer.trim().length > 0) {
    handleLine(buffer);
  }

  emit(splitter.flush());

  return { content: collected.reply.trim(), reasoning: collected.reasoning.trim() };
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

    const isEventStream = (response.headers.get('content-type') ?? '').includes('text/event-stream');

    if (streaming && isEventStream && request.onDelta) {
      let streamed: ChatCompletionResponse;

      try {
        streamed = await readStreamedContent(response, request.onDelta);
      } catch (error) {
        if (request.signal?.aborted || isAbortError(error)) {
          throw error;
        }

        throw new ProviderGenerationError(
          error instanceof Error ? `Provider stream failed: ${error.message}` : 'Provider stream failed.',
        );
      }

      if (!streamed.content && !request.allowEmptyContent) {
        throw new ProviderGenerationError('Provider returned an empty reply.');
      }

      return streamed;
    }

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

    if (!split.content && !request.allowEmptyContent) {
      throw new ProviderGenerationError('Provider returned an empty reply.');
    }

    return {
      content: split.content,
      reasoning,
    };
  }
}
