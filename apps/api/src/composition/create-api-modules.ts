import { type CharactersModule, createCharactersModule } from '../modules/characters/index.js';
import { type ChatsModule, createChatsModule } from '../modules/chats/index.js';
import { createGenerationModule, type GenerationModule } from '../modules/generation/index.js';
import { createLorebooksModule, type LorebooksModule } from '../modules/lorebooks/index.js';
import { createOpenAiCompatModule, type OpenAiCompatModule } from '../modules/openai-compat/index.js';
import { createPromptingModule, type PromptingModule } from '../modules/prompting/index.js';
import {
  getProviderSettings,
  resolveGenerationProviderEndpoint,
  testProviderConnection,
} from '../modules/providers/index.js';
import { getRunningRuntimeEndpoint, getRuntimeOverview } from '../modules/runtime/index.js';
import { createScenariosModule, type ScenariosModule } from '../modules/scenarios/index.js';
import { getProfileUserName, getSettingsOverview, resolveSamplerPresetForModel } from '../modules/settings/index.js';
import { createSystemModule, type SystemModule } from '../modules/system/index.js';
import type { ApiDependencies } from './api-dependencies.js';

export interface ApiModules {
  readonly system: SystemModule;
  readonly characters: CharactersModule;
  readonly lorebooks: LorebooksModule;
  readonly scenarios: ScenariosModule;
  readonly prompting: PromptingModule;
  readonly chats: ChatsModule;
  readonly generation: GenerationModule;
  readonly openAiCompat: OpenAiCompatModule;
}

export function createApiModules(dependencies: ApiDependencies): ApiModules {
  const {
    characterStore,
    chatCompletionClient,
    chatIndex,
    chatRepository,
    clock,
    config,
    generationJobs,
    httpFetch,
    lorebookStore,
    scenarioStore,
    tokenCounter,
    visionProbe,
  } = dependencies;
  const characters = createCharactersModule({ characterStore, chatStats: chatIndex, clock });
  const lorebooks = createLorebooksModule({ clock, lorebookStore });
  const scenarios = createScenariosModule({ clock, scenarioStore });
  const prompting = createPromptingModule({
    characters,
    lorebooks,
    scenarios,
    // TODO: wire to modules.settings once it is composed (F-42)
    settings: {
      getSettingsOverview: () => getSettingsOverview(),
    },
  });
  const chats = createChatsModule({
    chatRepository,
    clock,
    chatIndex,
    characters,
    scenarios,
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
    characters,
    lorebooks,
    scenarios,
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
