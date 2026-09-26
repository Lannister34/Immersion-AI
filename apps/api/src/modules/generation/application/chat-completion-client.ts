import type { ProviderApiKind } from '@immersion/contracts/providers';
import type { ReplyChannel } from '@immersion/domain/generation';

import type { ChatReplyPromptMessage } from '../../prompting/application/build-chat-reply-prompt.js';

export interface ChatCompletionEndpoint {
  apiKey: string | null;
  apiKind: ProviderApiKind;
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
  allowEmptyContent?: boolean | undefined;
  endpoint: ChatCompletionEndpoint;
  maxTokens: number;
  messages: ChatReplyPromptMessage[];
  onDelta?: ((delta: string, channel: ReplyChannel) => void) | undefined;
  sampling: ChatCompletionSamplingOptions;
  serverExtensions?: Record<string, unknown> | undefined;
  signal?: AbortSignal | undefined;
}

export interface ChatCompletionResponse {
  content: string;
  reasoning: string;
}

export interface ChatCompletionClient {
  completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}
