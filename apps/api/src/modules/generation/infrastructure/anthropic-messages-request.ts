import { buildAnthropicAuthHeaders } from '../../providers/index.js';
import type { ChatCompletionRequest } from '../application/chat-completion-client.js';
import type { AnthropicImageSource, AnthropicMessage, AnthropicPayload } from './anthropic-messages-request-wire.js';
import { parseAnthropicImageSource } from './parse-anthropic-image-source.js';

function buildMessageContent(message: ChatCompletionRequest['messages'][number]): AnthropicMessage['content'] {
  const images = (message.images ?? [])
    .map(parseAnthropicImageSource)
    .filter((source): source is AnthropicImageSource => source !== null)
    .map((source) => ({ source, type: 'image' as const }));

  return [...images, ...(message.content.trim().length > 0 ? [{ text: message.content, type: 'text' as const }] : [])];
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

export function buildAnthropicMessagesHeaders(apiKey: string | null) {
  return {
    ...buildAnthropicAuthHeaders(apiKey),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

export function buildAnthropicMessagesBody(request: ChatCompletionRequest) {
  const { conversation, system } = buildAnthropicPayload(request.messages);

  return {
    model: request.endpoint.model,
    messages: conversation,
    max_tokens: request.maxTokens,
    stream: Boolean(request.onDelta),
    ...(system ? { system } : {}),
    ...buildSamplingPayload(request.sampling),
  };
}
