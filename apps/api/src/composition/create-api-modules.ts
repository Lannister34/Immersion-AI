import {
  appendAssistantMessageContinuation,
  appendChatMessages,
  getChatSession,
  readChatAttachmentDataUrl,
  resolveChatAttachments,
  truncateChatMessages,
  updateChatTitle,
} from '../modules/chats/index.js';
import { createGenerationModule, type GenerationModule } from '../modules/generation/index.js';
import { createOpenAiCompatModule, type OpenAiCompatModule } from '../modules/openai-compat/index.js';
import {
  loadChatPromptContext,
  resolveChatGenerationSettings,
  resolveChatReplyGenerationPlan,
} from '../modules/prompting/index.js';
import {
  getProviderSettings,
  resolveGenerationProviderEndpoint,
  testProviderConnection,
} from '../modules/providers/index.js';
import { getRunningRuntimeEndpoint, getRuntimeOverview } from '../modules/runtime/index.js';
import { getSettingsOverview, resolveSamplerPresetForModel } from '../modules/settings/index.js';
import { createSystemModule, type SystemModule } from '../modules/system/index.js';
import type { ApiDependencies } from './api-dependencies.js';

export interface ApiModules {
  readonly system: SystemModule;
  readonly generation: GenerationModule;
  readonly openAiCompat: OpenAiCompatModule;
}

export function createApiModules(dependencies: ApiDependencies): ApiModules {
  const { chatCompletionClient, clock, config, generationJobs, httpFetch, tokenCounter, visionProbe } = dependencies;

  return {
    system: createSystemModule({ clock, webPort: config.webPort }),
    generation: createGenerationModule({
      chatCompletionClient,
      clock,
      generationJobs,
      tokenCounter,
      visionProbe,
      // TODO: wire to modules.chats once it is composed (F-37)
      chats: {
        appendAssistantMessageContinuation,
        appendChatMessages,
        getChatSession,
        readChatAttachmentDataUrl,
        resolveChatAttachments,
        truncateChatMessages,
        updateChatTitle,
      },
      // TODO: wire to modules.prompting once it is composed (F-36)
      prompting: {
        loadChatPromptContext,
        resolveChatGenerationSettings,
        resolveChatReplyGenerationPlan,
      },
      // TODO: wire to modules.providers once it is composed (F-40)
      providers: {
        getProviderSettings: () => getProviderSettings(),
        resolveGenerationProviderEndpoint: () => resolveGenerationProviderEndpoint(),
      },
      // TODO: wire to modules.runtime once it is composed (F-41)
      runtime: {
        getRunningRuntimeEndpoint: () => getRunningRuntimeEndpoint(),
        getRuntimeOverview: () => getRuntimeOverview(),
      },
      // TODO: wire to modules.settings once it is composed (F-42)
      settings: {
        getSettingsOverview: () => getSettingsOverview(),
      },
    }),
    openAiCompat: createOpenAiCompatModule({
      chatCompletionClient,
      clock,
      // TODO: wire to modules.providers once it is composed (F-40)
      providers: {
        resolveGenerationProviderEndpoint: () => resolveGenerationProviderEndpoint(),
        testConnection: () => testProviderConnection({ httpFetch }),
      },
      // TODO: wire to modules.settings once it is composed (F-42)
      settings: {
        resolveSamplerPresetForModel: (modelName) => resolveSamplerPresetForModel(getSettingsOverview(), modelName),
      },
      tokenCounter,
    }),
  };
}
