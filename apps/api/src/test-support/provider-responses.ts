export interface OpenAiStreamDelta {
  readonly content?: string;
  readonly reasoning_content?: string;
}

export function eventStream(frames: readonly string[]): Response {
  return new Response(frames.map((frame) => `data: ${frame}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
    status: 200,
  });
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

export function providerFailure(): Response {
  return Response.json({ error: 'provider failed' }, { status: 500 });
}
