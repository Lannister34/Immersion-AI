import type { ReplyChannel } from '@immersion/domain/generation';

import type { ChatCompletionResponse } from '../../application/chat-completion-client.js';
import { ProviderGenerationError } from '../../application/generation-errors.js';
import type { ProviderStreamSink } from '../provider-reply-reader.js';
import {
  type AnthropicMessageResponse,
  AnthropicMessageResponseSchema,
  AnthropicStreamEventSchema,
} from './response-wire.js';

function readResponseBlocks(payload: AnthropicMessageResponse): ChatCompletionResponse {
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

export function readAnthropicStreamData(data: string, sink: ProviderStreamSink) {
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

export async function readAnthropicJsonReply(response: Response): Promise<ChatCompletionResponse> {
  let payload: AnthropicMessageResponse;

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
