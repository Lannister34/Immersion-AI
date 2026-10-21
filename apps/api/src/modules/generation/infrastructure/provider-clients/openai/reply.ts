import { splitReply } from '@immersion/domain/generation';

import { ProviderGenerationError } from '../../../application/generation-errors.js';
import type { ProviderReply, ProviderStreamSink } from '../reply-reader.js';
import {
  type OpenAiChatCompletionReply,
  OpenAiChatCompletionReplySchema,
  OpenAiStreamChunkSchema,
  OpenAiStreamErrorSchema,
} from './response-wire.js';

const OPENAI_TOKEN_LIMIT_FINISH_REASON = 'length';

export function readOpenAiStreamData(data: string, sink: ProviderStreamSink) {
  if (data === '[DONE]') {
    return;
  }

  const chunk: unknown = JSON.parse(data);
  const streamError = OpenAiStreamErrorSchema.safeParse(chunk);

  if (streamError.success) {
    const { error } = streamError.data;

    throw new ProviderGenerationError(
      (typeof error === 'string' ? error : error.message) || 'Provider stream reported an error.',
    );
  }

  const parsed = OpenAiStreamChunkSchema.safeParse(chunk);

  if (!parsed.success) {
    return;
  }

  const choice = parsed.data.choices[0];
  const delta = choice?.delta;
  const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning ?? '';

  if (reasoningDelta.length > 0) {
    sink.reasoning(reasoningDelta);
  }

  const contentDelta = delta?.content ?? '';

  if (contentDelta.length > 0) {
    sink.reply(contentDelta);
  }

  if (choice?.finish_reason === OPENAI_TOKEN_LIMIT_FINISH_REASON) {
    sink.stoppedAtTokenLimit();
  }
}

export async function readOpenAiJsonReply(response: Response): Promise<ProviderReply> {
  const responseText = await response.text();
  let payload: OpenAiChatCompletionReply;

  try {
    payload = OpenAiChatCompletionReplySchema.parse(JSON.parse(responseText));
  } catch (error) {
    throw new ProviderGenerationError(
      error instanceof Error
        ? `Provider returned an invalid response: ${error.message}`
        : 'Provider returned an invalid response.',
    );
  }

  const choice = payload.choices[0];
  const message = choice?.message;
  const split = splitReply(message?.content ?? '');
  const reasoning = [message?.reasoning_content ?? message?.reasoning ?? '', split.reasoning]
    .filter((part) => part.trim().length > 0)
    .join('\n\n')
    .trim();

  return {
    content: split.content,
    reasoning,
    stoppedAtTokenLimit: choice?.finish_reason === OPENAI_TOKEN_LIMIT_FINISH_REASON,
  };
}
