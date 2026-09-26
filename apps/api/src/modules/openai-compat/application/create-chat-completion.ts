import type { ReplyChannel } from '@immersion/domain/generation';

import {
  type ChatCompletionClient,
  createChatCompletionClient,
  getProviderTokenCounter,
} from '../../generation/index.js';
import type { ChatReplyPromptMessage } from '../../prompting/index.js';
import { resolveGenerationProviderEndpoint } from '../../providers/index.js';
import { getSettingsOverview, resolveSamplerPresetForModel } from '../../settings/index.js';
import {
  assertSupportedRequest,
  normalizeOpenAiMessages,
  type OpenAiChatCompletionRequest,
} from '../domain/openai-contract.js';

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

function collectServerExtensions(request: OpenAiChatCompletionRequest): Record<string, unknown> {
  const extensions: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(request)) {
    if (!HANDLED_REQUEST_KEYS.has(key) && value !== undefined) {
      extensions[key] = value;
    }
  }

  return extensions;
}

const PLACEHOLDER_MODEL_NAMES = new Set(['', 'default', 'immersion', 'immersion-ai', 'gpt-3.5-turbo', 'gpt-4']);

export interface OpenAiChatCompletionDependencies {
  chatCompletionClient?: ChatCompletionClient;
  onDelta?: (delta: string, channel: ReplyChannel, model: string) => void;
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

export async function createOpenAiChatCompletion(
  request: OpenAiChatCompletionRequest,
  dependencies: OpenAiChatCompletionDependencies = {},
): Promise<OpenAiChatCompletionResult> {
  assertSupportedRequest(request);

  const messages = toPromptMessages(request);
  const providerEndpoint = await resolveGenerationProviderEndpoint();
  const requestedModel = request.model?.trim() ?? '';
  const model = PLACEHOLDER_MODEL_NAMES.has(requestedModel.toLowerCase()) ? providerEndpoint.model : requestedModel;
  const settings = getSettingsOverview();
  const preset = resolveSamplerPresetForModel(settings, model);
  const client = dependencies.chatCompletionClient ?? createChatCompletionClient();
  const { onDelta } = dependencies;

  const serverExtensions = collectServerExtensions(request);
  const completion = await client.completeChat({
    allowEmptyContent: true,
    endpoint: { ...providerEndpoint, model },
    maxTokens: request.max_completion_tokens ?? request.max_tokens ?? preset.maxTokens,
    messages,
    ...(onDelta ? { onDelta: (delta: string, channel: ReplyChannel) => onDelta(delta, channel, model) } : {}),
    sampling: {
      minP: preset.minP,
      presencePenalty: request.presence_penalty ?? preset.presencePenalty,
      repeatPenalty: preset.repeatPenalty,
      repeatPenaltyRange: preset.repeatPenaltyRange,
      temperature: request.temperature ?? preset.temperature,
      topK: preset.topK,
      topP: request.top_p ?? preset.topP,
    },
    ...(Object.keys(serverExtensions).length > 0 ? { serverExtensions } : {}),
    signal: dependencies.signal,
  });

  return {
    content: completion.content,
    model,
    reasoning: completion.reasoning,
    usage: await countUsage(messages, completion.content),
  };
}
