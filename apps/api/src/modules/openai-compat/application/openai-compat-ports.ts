import type { ReplyTokenLimit } from '@immersion/contracts/common';
import type { ProviderConnectionResponse } from '@immersion/contracts/providers';

import type { ChatCompletionEndpoint, ChatCompletionSamplingOptions } from '../../generation/index.js';

export interface OpenAiCompatProvidersPort {
  resolveGenerationProviderEndpoint(): Promise<ChatCompletionEndpoint>;
  testConnection(): Promise<ProviderConnectionResponse>;
}

export interface OpenAiCompatSamplerPreset extends ChatCompletionSamplingOptions {
  readonly maxTokens: ReplyTokenLimit;
}

export interface OpenAiCompatSettingsPort {
  resolveSamplerPresetForModel(modelName: string): OpenAiCompatSamplerPreset;
}
