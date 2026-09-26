import { createReplySplitter, type ReplyChannel, type ReplyChunk } from '@immersion/domain/generation';

import type { ChatCompletionRequest, ChatCompletionResponse } from '../application/chat-completion-client.js';
import { ProviderGenerationError } from '../application/generation-errors.js';
import { isAbortError } from './provider-http.js';

export interface ProviderStreamSink {
  reasoning(text: string): void;
  reply(text: string): void;
}

export type ProviderStreamDataHandler = (data: string, sink: ProviderStreamSink) => void;

export interface ProviderReplyReaders {
  readJson(response: Response): Promise<ChatCompletionResponse>;
  readStreamData: ProviderStreamDataHandler;
}

async function readProviderStream(
  response: Response,
  onDelta: (delta: string, channel: ReplyChannel) => void,
  handleData: ProviderStreamDataHandler,
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

  const sink: ProviderStreamSink = {
    reasoning: (text) => emit([{ channel: 'reasoning', text }]),
    reply: (text) => emit(splitter.push(text)),
  };

  const handleLine = (line: string) => {
    const trimmed = line.trim();

    if (!trimmed.startsWith('data:')) {
      return;
    }

    handleData(trimmed.slice('data:'.length).trim(), sink);
  };

  try {
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
  } catch (error) {
    await Promise.allSettled([reader.cancel()]);
    throw error;
  }

  emit(splitter.flush());

  return { content: collected.reply.trim(), reasoning: collected.reasoning.trim() };
}

async function readStreamedReply(
  response: Response,
  request: ChatCompletionRequest,
  onDelta: (delta: string, channel: ReplyChannel) => void,
  handleData: ProviderStreamDataHandler,
): Promise<ChatCompletionResponse> {
  try {
    return await readProviderStream(response, onDelta, handleData);
  } catch (error) {
    if (request.signal?.aborted || isAbortError(error)) {
      throw error;
    }

    throw new ProviderGenerationError(
      error instanceof Error ? `Provider stream failed: ${error.message}` : 'Provider stream failed.',
    );
  }
}

export async function readProviderReply(
  response: Response,
  request: ChatCompletionRequest,
  readers: ProviderReplyReaders,
): Promise<ChatCompletionResponse> {
  const isEventStream = (response.headers.get('content-type') ?? '').includes('text/event-stream');
  const completion =
    request.onDelta && isEventStream
      ? await readStreamedReply(response, request, request.onDelta, readers.readStreamData)
      : await readers.readJson(response);

  if (!completion.content && !request.allowEmptyContent) {
    throw new ProviderGenerationError('Provider returned an empty reply.');
  }

  return completion;
}
