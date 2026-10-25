export function chatCompletionReply(content: string, finishReason = 'stop'): Response {
  return Response.json({ choices: [{ finish_reason: finishReason, message: { content } }] });
}
