import { type CharactersModule, createCharactersModule } from '../modules/characters/index.js';
import { type ChatsModule, createChatsModule } from '../modules/chats/index.js';
import { createGenerationModule, type GenerationModule } from '../modules/generation/index.js';
import { createLorebooksModule, type LorebooksModule } from '../modules/lorebooks/index.js';
import { createOpenAiCompatModule, type OpenAiCompatModule } from '../modules/openai-compat/index.js';
import { createPromptingModule, type PromptingModule } from '../modules/prompting/index.js';
import { createProvidersModule, type ProvidersModule } from '../modules/providers/index.js';
import { createRuntimeModule, type RuntimeModule } from '../modules/runtime/index.js';
import { createScenariosModule, type ScenariosModule } from '../modules/scenarios/index.js';
import { createSettingsModule, type SettingsModule } from '../modules/settings/index.js';
import { createSystemModule, type SystemModule } from '../modules/system/index.js';
import type { ApiDependencies } from './api-dependencies.js';

export interface ApiModules {
  readonly system: SystemModule;
  readonly characters: CharactersModule;
  readonly providers: ProvidersModule;
  readonly runtime: RuntimeModule;
  readonly settings: SettingsModule;
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
    logger,
    lorebookStore,
    modelScanner,
    runtimeProcess,
    scenarioStore,
    tokenCounter,
    userSettings,
    visionProbe,
  } = dependencies;
  const settings = createSettingsModule({ userSettings });
  const runtime = createRuntimeModule({
    dataRoot: config.dataRoot,
    httpFetch,
    logger,
    modelScanner,
    projectRoot: config.projectRoot,
    runtimeProcess,
    settingsDocument: userSettings,
  });
  const providers = createProvidersModule({
    httpFetch,
    runtimeEndpoint: { getRunningEndpoint: () => runtime.getRunningRuntimeEndpoint() },
    settingsDocument: userSettings,
  });
  const characters = createCharactersModule({ characterStore, chatStats: chatIndex, clock });
  const lorebooks = createLorebooksModule({ clock, lorebookStore });
  const scenarios = createScenariosModule({ clock, scenarioStore });
  const prompting = createPromptingModule({
    characters,
    lorebooks,
    scenarios,
    settings,
  });
  const chats = createChatsModule({
    chatRepository,
    clock,
    chatIndex,
    characters,
    scenarios,
    profile: settings,
    samplerPresets: settings,
  });

  return {
    system: createSystemModule({ clock, webPort: config.webPort }),
    characters,
    lorebooks,
    scenarios,
    providers,
    runtime,
    settings,
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
      providers,
      runtime,
      settings,
    }),
    openAiCompat: createOpenAiCompatModule({
      chatCompletionClient,
      clock,
      providers,
      settings,
      tokenCounter,
    }),
  };
}
