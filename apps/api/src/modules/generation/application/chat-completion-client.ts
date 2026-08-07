import type { ReplyChannel } from '@immersion/domain/generation';

import type { ChatReplyPromptMessage } from '../../prompting/application/build-chat-reply-prompt.js';

export interface ChatCompletionEndpoint {
  apiKey: string | null;
  baseUrl: string;
  model: string;
}

export interface ChatCompletionSamplingOptions {
  minP: number;
  presencePenalty: number;
  repeatPenalty: number;
  repeatPenaltyRange: number;
  temperature: number;
  topK: number;
  topP: number;
}

export interface ChatCompletionRequest {
  endpoint: ChatCompletionEndpoint;
  maxTokens: number;
  messages: ChatReplyPromptMessage[];
  /** Куски ответа по мере генерации; без колбэка запрос идёт без стриминга. */
  onDelta?: ((delta: string, channel: ReplyChannel) => void) | undefined;
  sampling: ChatCompletionSamplingOptions;
  signal?: AbortSignal | undefined;
}

export interface ChatCompletionResponse {
  content: string;
  /** Размышления модели, если она их присылала. */
  reasoning: string;
}

export interface ChatCompletionClient {
  completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}
