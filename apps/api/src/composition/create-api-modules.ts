import { findCharacter, getCharacter } from '../modules/characters/index.js';
import { type ChatsModule, createChatsModule } from '../modules/chats/index.js';
import { createGenerationModule, type GenerationModule } from '../modules/generation/index.js';
import { listIndexedChatSummaries } from '../modules/indexing/index.js';
import { findLorebook } from '../modules/lorebooks/index.js';
import { createOpenAiCompatModule, type OpenAiCompatModule } from '../modules/openai-compat/index.js';
import { createPromptingModule, type PromptingModule } from '../modules/prompting/index.js';
import {
  getProviderSettings,
  resolveGenerationProviderEndpoint,
  testProviderConnection,
} from '../modules/providers/index.js';
import { getRunningRuntimeEndpoint, getRuntimeOverview } from '../modules/runtime/index.js';
import { findScenario, getScenario } from '../modules/scenarios/index.js';
import { getProfileUserName, getSettingsOverview, resolveSamplerPresetForModel } from '../modules/settings/index.js';
import { createSystemModule, type SystemModule } from '../modules/system/index.js';
import type { ApiDependencies } from './api-dependencies.js';

export interface ApiModules {
  readonly system: SystemModule;
  readonly prompting: PromptingModule;
  readonly chats: ChatsModule;
  readonly generation: GenerationModule;
  readonly openAiCompat: OpenAiCompatModule;
}

export function createApiModules(dependencies: ApiDependencies): ApiModules {
  const { chatCompletionClient, chatRepository, clock, config, generationJobs, httpFetch, tokenCounter, visionProbe } =
    dependencies;
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
  const chats = createChatsModule({
    chatRepository,
    clock,
    // TODO: wire to the app's own chat index once it is composed (F-38)
    chatIndex: { listChatSummaries: (options) => listIndexedChatSummaries(options) },
    // TODO: wire to modules.characters once it is composed (F-39)
    characters: { getCharacter },
    // TODO: wire to modules.scenarios once it is composed (F-39)
    scenarios: { getScenario },
    // TODO: wire to modules.settings once it is composed (F-42)
    profile: { getProfileUserName: () => getProfileUserName() },
    // TODO: wire to modules.settings once it is composed (F-42)
    samplerPresets: {
      findSamplerPreset: (presetId) =>
        getSettingsOverview().sampler.presets.find((preset) => preset.id === presetId) ?? null,
    },
  });

  return {
    system: createSystemModule({ clock, webPort: config.webPort }),
    prompting,
    chats,
    generation: createGenerationModule({
      chatCompletionClient,
      chats,
      clock,
      generationJobs,
      tokenCounter,
      visionProbe,
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
