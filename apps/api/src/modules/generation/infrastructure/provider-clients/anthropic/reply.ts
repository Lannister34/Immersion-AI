import type { ReplyChannel } from '@immersion/domain/generation';

import type { ChatCompletionResponse } from '../../../application/chat-completion-client.js';
import { ProviderGenerationError } from '../../../application/generation-errors.js';
import { isAbortError } from '../http.js';
import type { ProviderStreamSink } from '../reply-reader.js';
import {
  type AnthropicMessageResponse,
  AnthropicMessageResponseSchema,
  AnthropicStreamEventSchema,
} from './response-wire.js';

const ANTHROPIC_TOKEN_LIMIT_STOP_REASONS: ReadonlySet<string> = new Set([
  'max_tokens',
  'model_context_window_exceeded',
]);

function isTokenLimitStop(stopReason: string | null | undefined): boolean {
  return stopReason !== null && stopReason !== undefined && ANTHROPIC_TOKEN_LIMIT_STOP_REASONS.has(stopReason);
}

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

  return {
    content: parts.reply.join('').trim(),
    reasoning: parts.reasoning.join('').trim(),
    stoppedAtTokenLimit: isTokenLimitStop(payload.stop_reason),
  };
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

  if (event.type === 'message_delta' && isTokenLimitStop(event.delta?.stop_reason)) {
    sink.stoppedAtTokenLimit();
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
    if (isAbortError(error)) {
      throw error;
    }

    throw new ProviderGenerationError(
      error instanceof Error
        ? `Provider returned an invalid response: ${error.message}`
        : 'Provider returned an invalid response.',
    );
  }

  return readResponseBlocks(payload);
}
