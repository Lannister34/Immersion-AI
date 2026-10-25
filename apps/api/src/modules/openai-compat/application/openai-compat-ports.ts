import type { ProviderConnectionResponse } from '@immersion/contracts/providers';

import type { ChatCompletionEndpoint, ChatCompletionSamplingOptions } from '../../generation/index.js';

export interface OpenAiCompatProvidersPort {
  resolveGenerationProviderEndpoint(): Promise<ChatCompletionEndpoint>;
  testConnection(): Promise<ProviderConnectionResponse>;
}

export interface OpenAiCompatSamplerPreset extends ChatCompletionSamplingOptions {
  readonly maxTokens: number;
}

export interface OpenAiCompatSettingsPort {
  resolveSamplerPresetForModel(modelName: string): OpenAiCompatSamplerPreset;
}
