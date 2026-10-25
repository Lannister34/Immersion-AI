import type { SettingsOverviewResponse } from '@immersion/contracts/settings';

import type { ChatCompletionClient, ChatCompletionEndpoint } from './chat-completion-client.js';

export interface ProviderEndpointResolver {
  resolveGenerationProviderEndpoint(): Promise<ChatCompletionEndpoint>;
}

export interface DraftSettingsSource {
  getSettingsOverview(): SettingsOverviewResponse;
}

export interface DraftGenerationDependencies {
  readonly chatCompletionClient: ChatCompletionClient;
  readonly providers: ProviderEndpointResolver;
  readonly settings: DraftSettingsSource;
}

export interface DraftGenerationOptions {
  readonly signal?: AbortSignal;
}
