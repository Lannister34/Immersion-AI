import { findCharacter } from '../modules/characters/index.js';
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
import { findLorebook } from '../modules/lorebooks/index.js';
import { createOpenAiCompatModule, type OpenAiCompatModule } from '../modules/openai-compat/index.js';
import { createPromptingModule, type PromptingModule } from '../modules/prompting/index.js';
import {
  getProviderSettings,
  resolveGenerationProviderEndpoint,
  testProviderConnection,
} from '../modules/providers/index.js';
import { getRunningRuntimeEndpoint, getRuntimeOverview } from '../modules/runtime/index.js';
import { findScenario } from '../modules/scenarios/index.js';
import { getSettingsOverview, resolveSamplerPresetForModel } from '../modules/settings/index.js';
import { createSystemModule, type SystemModule } from '../modules/system/index.js';
import type { ApiDependencies } from './api-dependencies.js';

export interface ApiModules {
  readonly system: SystemModule;
  readonly prompting: PromptingModule;
  readonly generation: GenerationModule;
  readonly openAiCompat: OpenAiCompatModule;
}

export function createApiModules(dependencies: ApiDependencies): ApiModules {
  const { chatCompletionClient, clock, config, generationJobs, httpFetch, tokenCounter, visionProbe } = dependencies;
  const prompting = createPromptingModule({
    // TODO: wire to modules.characters once it is composed (F-39)
    characters: { findCharacter },
    // TODO: wire to modules.lorebooks once it is composed (F-39)
    lorebooks: { findLorebook },
    // TODO: wire to modules.scenarios once it is composed (F-39)
    scenarios: { findScenario },
    // TODO: wire to modules.settings once it is composed (F-42)
    settings: {
      getSettingsOverview: () => getSettingsOverview(),
    },
  });

  return {
    system: createSystemModule({ clock, webPort: config.webPort }),
    prompting,
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
      prompting,
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
