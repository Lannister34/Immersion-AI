import { z } from 'zod';

import { resolveChatCompletionsUrl } from '../../providers/application/generation-provider.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { ProviderGenerationError } from '../application/generation-errors.js';

const OpenAiCompatibleStreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullable().optional(),
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

function buildRequestSignal(signal: AbortSignal | undefined) {
  const timeoutSignal = AbortSignal.timeout(10 * 60 * 1000);

  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function isAbortError(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

/**
 * Разбирает поток OpenAI: строки `data: {...}` с кусками ответа и завершающим
 * `[DONE]`. Куски отдаём наружу по мере поступления и одновременно копим —
 * в транскрипт всё равно ложится целый ответ.
 */
async function readStreamedContent(response: Response, onDelta: (delta: string) => void): Promise<string> {
  const body = response.body;

  if (!body) {
    throw new ProviderGenerationError('Provider returned an empty stream.');
  }

  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  let content = '';

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

    const delta = parsed.data.choices[0]?.delta?.content ?? '';

    if (delta.length > 0) {
      content += delta;
      onDelta(delta);
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

  return content;
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
          model: request.endpoint.model,
          messages: request.messages.map(buildMessagePayload),
          max_tokens: request.maxTokens,
          min_p: request.sampling.minP,
          presence_penalty: request.sampling.presencePenalty,
          rep_pen: request.sampling.repeatPenalty,
          rep_pen_range: request.sampling.repeatPenaltyRange,
          stream: streaming,
          temperature: request.sampling.temperature,
          top_k: request.sampling.topK,
          top_p: request.sampling.topP,
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
      const errorText = await response.text();

      throw new ProviderGenerationError(
        `Provider returned HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 500)}` : ''}`,
      );
    }

    // Просить поток и получить обычный JSON — нормальный ответ сервера, который
    // стриминг не умеет. Решает content-type, а не наш запрос.
    const isEventStream = (response.headers.get('content-type') ?? '').includes('text/event-stream');

    if (streaming && isEventStream && request.onDelta) {
      let streamedContent: string;

      try {
        streamedContent = await readStreamedContent(response, request.onDelta);
      } catch (error) {
        if (request.signal?.aborted || isAbortError(error)) {
          throw error;
        }

        throw new ProviderGenerationError(
          error instanceof Error ? `Provider stream failed: ${error.message}` : 'Provider stream failed.',
        );
      }

      const content = streamedContent.trim();

      if (!content) {
        throw new ProviderGenerationError('Provider returned an empty reply.');
      }

      return { content };
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

    const content = payload.choices[0]?.message.content?.trim();

    if (!content) {
      throw new ProviderGenerationError('Provider returned an empty reply.');
    }

    return {
      content,
    };
  }
}
