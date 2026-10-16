import type { ChatCompletionRequest } from '../../application/chat-completion-client.js';
import { isOpenAiReasoningModel } from './reasoning-model.js';

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

  const isReasoningModel = isOpenAiReasoningModel(request.endpoint.model);

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

export function buildOpenAiHeaders(apiKey: string | null) {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export function buildOpenAiBody(request: ChatCompletionRequest) {
  return {
    ...buildServerExtensions(request),
    model: request.endpoint.model,
    messages: request.messages.map(buildMessagePayload),
    stream: Boolean(request.onDelta),
    ...buildGenerationPayload(request),
  };
}
