import type { ReplyChannel } from '@immersion/domain/generation';

import type { ChatCompletionClient } from '../../generation/application/chat-completion-client.js';
import { createChatCompletionClient } from '../../generation/infrastructure/chat-completion-client-factory.js';
import { getProviderTokenCounter } from '../../generation/infrastructure/provider-token-counter.js';
import type { ChatReplyPromptMessage } from '../../prompting/application/build-chat-reply-prompt.js';
import { resolveGenerationProviderEndpoint } from '../../providers/application/generation-provider.js';
import { resolveSamplerPresetForModel } from '../../settings/application/active-sampler-preset.js';
import { getSettingsOverview } from '../../settings/application/get-settings-overview.js';
import {
  assertSupportedRequest,
  normalizeOpenAiMessages,
  type OpenAiChatCompletionRequest,
} from '../domain/openai-contract.js';

/**
 * Поля, которые разбираем сами. Всё остальное — расширения конкретного сервера
 * (enable_thinking, chat_template_kwargs, seed, stop): их отдаём провайдеру как
 * есть, иначе клиент не может докричаться до собственного бэкенда через нас.
 */
const HANDLED_REQUEST_KEYS = new Set([
  'max_completion_tokens',
  'max_tokens',
  'messages',
  'model',
  'n',
  'presence_penalty',
  'stream',
  'temperature',
  'tool_choice',
  'tools',
  'top_p',
]);

function collectProviderOptions(request: OpenAiChatCompletionRequest): Record<string, unknown> {
  const options: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(request)) {
    if (!HANDLED_REQUEST_KEYS.has(key) && value !== undefined) {
      options[key] = value;
    }
  }

  return options;
}

/** Значения, которыми клиенты обозначают «сам решай»: модель берём из настроек. */
const MODEL_ALIASES = new Set(['', 'default', 'immersion', 'immersion-ai', 'gpt-3.5-turbo', 'gpt-4']);

export interface OpenAiChatCompletionDependencies {
  chatCompletionClient?: ChatCompletionClient;
  onDelta?: (delta: string, channel: ReplyChannel) => void;
  signal?: AbortSignal;
}

export interface OpenAiChatCompletionResult {
  content: string;
  model: string;
  reasoning: string;
  usage: {
    completionTokens: number;
    promptTokens: number;
  };
}

function toPromptMessages(request: OpenAiChatCompletionRequest): ChatReplyPromptMessage[] {
  return normalizeOpenAiMessages(request.messages).map((message) => ({
    content: message.content,
    ...(message.images.length > 0 ? { images: message.images } : {}),
    role: message.role,
  }));
}

/**
 * Счётчик токенов у нас точный только для встроенного рантайма, для остальных
 * это оценка. Поле usage в ответе всё равно ждут, поэтому отдаём оценку, а не
 * нули: нули клиент принял бы за правду.
 */
async function countUsage(promptMessages: ChatReplyPromptMessage[], reply: string) {
  const counter = getProviderTokenCounter();
  const [promptCounts, replyCounts] = await Promise.all([
    counter.countTokens(promptMessages.map((message) => message.content)),
    counter.countTokens([reply]),
  ]);

  return {
    completionTokens: replyCounts.counts[0] ?? 0,
    promptTokens: promptCounts.counts.reduce((total, count) => total + count, 0),
  };
}

/**
 * Однократная генерация по чужому запросу: своей истории мы не ведём и на диск
 * ничего не пишем — весь диалог приходит в теле запроса, как и положено
 * OpenAI-совместимому эндпоинту. От Immersion здесь остаются подобранный
 * провайдер (включая Claude) и параметры сэмплера из настроек.
 */
export async function createOpenAiChatCompletion(
  request: OpenAiChatCompletionRequest,
  dependencies: OpenAiChatCompletionDependencies = {},
): Promise<OpenAiChatCompletionResult> {
  assertSupportedRequest(request);

  const messages = toPromptMessages(request);
  const providerEndpoint = await resolveGenerationProviderEndpoint();
  const requestedModel = request.model?.trim() ?? '';
  // Модель из запроса уважаем: для клиента это его выбор, а не подсказка.
  const model = MODEL_ALIASES.has(requestedModel.toLowerCase()) ? providerEndpoint.model : requestedModel;
  const settings = getSettingsOverview();
  const preset = resolveSamplerPresetForModel(settings, model);
  const client = dependencies.chatCompletionClient ?? createChatCompletionClient();

  const providerOptions = collectProviderOptions(request);
  const completion = await client.completeChat({
    // Пустой ответ здесь не ошибка: модель могла потратить лимит на
    // размышления, и клиент вправе увидеть это как finish_reason: length.
    allowEmptyContent: true,
    endpoint: { ...providerEndpoint, model },
    maxTokens: request.max_completion_tokens ?? request.max_tokens ?? preset.maxTokens,
    messages,
    ...(dependencies.onDelta ? { onDelta: dependencies.onDelta } : {}),
    ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    sampling: {
      minP: preset.minP,
      presencePenalty: request.presence_penalty ?? preset.presencePenalty,
      repeatPenalty: preset.repeatPenalty,
      repeatPenaltyRange: preset.repeatPenaltyRange,
      temperature: request.temperature ?? preset.temperature,
      topK: preset.topK,
      topP: request.top_p ?? preset.topP,
    },
    signal: dependencies.signal,
  });

  return {
    content: completion.content,
    model,
    reasoning: completion.reasoning,
    usage: await countUsage(messages, completion.content),
  };
}
