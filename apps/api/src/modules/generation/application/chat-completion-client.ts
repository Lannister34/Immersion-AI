import type { ProviderApiKind } from '@immersion/contracts/providers';
import type { ReplyChannel } from '@immersion/domain/generation';

import type { ChatReplyPromptMessage } from '../../prompting/application/build-chat-reply-prompt.js';

export interface ChatCompletionEndpoint {
  apiKey: string | null;
  /** Диалект API провайдера: по нему выбирается клиент запроса. */
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
  /**
   * Ответ без текста — не всегда ошибка: модель могла потратить весь лимит на
   * размышления. Для чата это сбой, для OpenAI-совместимого входа — обычный
   * ответ с finish_reason: length, поэтому решает вызывающий.
   */
  allowEmptyContent?: boolean | undefined;
  endpoint: ChatCompletionEndpoint;
  maxTokens: number;
  messages: ChatReplyPromptMessage[];
  /** Куски ответа по мере генерации; без колбэка запрос идёт без стриминга. */
  onDelta?: ((delta: string, channel: ReplyChannel) => void) | undefined;
  /**
   * Поля запроса, которые понимает конкретный сервер и не описывает контракт
   * OpenAI: enable_thinking, chat_template_kwargs, seed, stop. Уходят только
   * локальным OpenAI-совместимым серверам — облака отвечают 400 на незнакомое.
   */
  providerOptions?: Record<string, unknown> | undefined;
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
