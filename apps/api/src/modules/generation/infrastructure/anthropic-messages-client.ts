import type { ReplyChannel } from '@immersion/domain/generation';
import { z } from 'zod';

import { buildAnthropicAuthHeaders, resolveAnthropicMessagesUrl } from '../../providers/index.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { ProviderGenerationError } from '../application/generation-errors.js';
import { buildRequestSignal, isAbortError, readProviderErrorText } from './provider-http.js';
import { type ProviderStreamSink, readProviderReply } from './provider-reply-reader.js';

const AnthropicContentBlockSchema = z.object({
  text: z.string().optional(),
  thinking: z.string().optional(),
  type: z.string(),
});

const AnthropicMessageResponseSchema = z.object({
  content: z.array(AnthropicContentBlockSchema),
});

const AnthropicStreamEventSchema = z.object({
  delta: AnthropicContentBlockSchema.optional(),
  error: z.object({ message: z.string().optional() }).optional(),
  type: z.string(),
});

interface AnthropicImageSource {
  data: string;
  media_type: string;
  type: 'base64';
}

function parseDataUrl(dataUrl: string): AnthropicImageSource | null {
  const match = /^data:(?<mediaType>[^;,]+);base64,(?<data>.+)$/su.exec(dataUrl);
  const mediaType = match?.groups?.mediaType;
  const data = match?.groups?.data;

  if (!mediaType || !data) {
    return null;
  }

  return { data, media_type: mediaType, type: 'base64' };
}

type AnthropicRole = 'assistant' | 'user';

interface AnthropicMessage {
  content: Array<{ text: string; type: 'text' } | { source: AnthropicImageSource; type: 'image' }>;
  role: AnthropicRole;
}

function buildMessageContent(message: ChatCompletionRequest['messages'][number]): AnthropicMessage['content'] {
  const images = (message.images ?? [])
    .map(parseDataUrl)
    .filter((source): source is AnthropicImageSource => source !== null)
    .map((source) => ({ source, type: 'image' as const }));

  return [...images, ...(message.content.trim().length > 0 ? [{ text: message.content, type: 'text' as const }] : [])];
}

export interface AnthropicPayload {
  conversation: AnthropicMessage[];
  system: string;
}

export function buildAnthropicPayload(messages: ChatCompletionRequest['messages']): AnthropicPayload {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .filter((content) => content.trim().length > 0)
    .join('\n\n');

  const conversation: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      continue;
    }

    const content = buildMessageContent(message);

    if (content.length === 0) {
      continue;
    }

    const previous = conversation.at(-1);

    if (previous?.role === message.role) {
      previous.content.push(...content);
      continue;
    }

    conversation.push({ content, role: message.role });
  }

  if (conversation[0]?.role === 'assistant') {
    conversation.unshift({ content: [{ text: '(Начало сцены.)', type: 'text' }], role: 'user' });
  }

  return { conversation, system };
}

function buildSamplingPayload(sampling: ChatCompletionRequest['sampling']) {
  return {
    temperature: Math.min(Math.max(sampling.temperature, 0), 1),
    ...(sampling.topK > 0 ? { top_k: Math.round(sampling.topK) } : {}),
  };
}

function buildHeaders(apiKey: string | null) {
  return {
    ...buildAnthropicAuthHeaders(apiKey),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function readResponseBlocks(payload: z.infer<typeof AnthropicMessageResponseSchema>): ChatCompletionResponse {
  const parts: Record<ReplyChannel, string[]> = { reasoning: [], reply: [] };

  for (const block of payload.content) {
    if (block.type === 'text' && block.text) {
      parts.reply.push(block.text);
    }

    if (block.type === 'thinking' && block.thinking) {
      parts.reasoning.push(block.thinking);
    }
  }

  return { content: parts.reply.join('').trim(), reasoning: parts.reasoning.join('').trim() };
}

function readAnthropicStreamData(data: string, sink: ProviderStreamSink) {
  const parsed = AnthropicStreamEventSchema.safeParse(JSON.parse(data));

  if (!parsed.success) {
    return;
  }

  const event = parsed.data;

  if (event.type === 'error') {
    throw new ProviderGenerationError(event.error?.message ?? 'Provider stream reported an error.');
  }

  const delta = event.type === 'content_block_delta' ? event.delta : undefined;

  if (delta?.type === 'thinking_delta' && delta.thinking) {
    sink.reasoning(delta.thinking);
  }

  if (delta?.type === 'text_delta' && delta.text) {
    sink.reply(delta.text);
  }
}

async function readAnthropicJsonReply(response: Response): Promise<ChatCompletionResponse> {
  let payload: z.infer<typeof AnthropicMessageResponseSchema>;

  try {
    payload = AnthropicMessageResponseSchema.parse(JSON.parse(await response.text()));
  } catch (error) {
    throw new ProviderGenerationError(
      error instanceof Error
        ? `Provider returned an invalid response: ${error.message}`
        : 'Provider returned an invalid response.',
    );
  }

  return readResponseBlocks(payload);
}

export class AnthropicMessagesClient implements ChatCompletionClient {
  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const streaming = Boolean(request.onDelta);
    const { conversation, system } = buildAnthropicPayload(request.messages);
    let response: Response;

    try {
      response = await fetch(resolveAnthropicMessagesUrl(request.endpoint), {
        method: 'POST',
        headers: buildHeaders(request.endpoint.apiKey),
        body: JSON.stringify({
          model: request.endpoint.model,
          messages: conversation,
          max_tokens: request.maxTokens,
          stream: streaming,
          ...(system ? { system } : {}),
          ...buildSamplingPayload(request.sampling),
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
      readJson: readAnthropicJsonReply,
      readStreamData: readAnthropicStreamData,
    });
  }
}
