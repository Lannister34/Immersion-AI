export interface OpenAiStreamDelta {
  readonly content?: string;
  readonly reasoning?: string;
  readonly reasoning_content?: string;
}

export interface AnthropicStreamEventFixture {
  readonly type: string;
  readonly [field: string]: unknown;
}

export function eventStreamResponse(body: string | ReadableStream<Uint8Array>): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
    status: 200,
  });
}

export function eventStream(frames: readonly string[]): Response {
  return eventStreamResponse(frames.map((frame) => `data: ${frame}\n\n`).join(''));
}

export function openAiChatStream(deltas: readonly OpenAiStreamDelta[]): Response {
  return eventStream([...deltas.map((delta) => JSON.stringify({ choices: [{ delta }] })), '[DONE]']);
}

export type OpenAiFinishReason = 'length' | 'stop';

export function openAiChatCompletion(content: string, finishReason: OpenAiFinishReason = 'stop'): Response {
  return Response.json({ choices: [{ finish_reason: finishReason, message: { content } }] });
}

export function anthropicMessage(text: string): Response {
  return Response.json({ content: [{ text, type: 'text' }] });
}

export function anthropicMessageStream(events: readonly AnthropicStreamEventFixture[]): Response {
  return eventStreamResponse(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
  );
}

export function bodyHeldUntilAborted(signal: AbortSignal | null, contentType: string, firstChunk: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(firstChunk));

      if (signal?.aborted) {
        controller.error(signal.reason);
        return;
      }

      signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    },
  });

  return new Response(body, { headers: { 'Content-Type': contentType }, status: 200 });
}

export function providerFailure(): Response {
  return Response.json({ error: 'provider failed' }, { status: 500 });
}
