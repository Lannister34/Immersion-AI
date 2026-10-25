import { createGenerationModule, type GenerationModule, getProviderTokenCounter } from '../modules/generation/index.js';
import { createOpenAiCompatModule, type OpenAiCompatModule } from '../modules/openai-compat/index.js';
import { resolveGenerationProviderEndpoint, testProviderConnection } from '../modules/providers/index.js';
import { getSettingsOverview, resolveSamplerPresetForModel } from '../modules/settings/index.js';
import { createSystemModule, type SystemModule } from '../modules/system/index.js';
import type { ApiDependencies } from './api-dependencies.js';

export interface ApiModules {
  readonly system: SystemModule;
  readonly generation: GenerationModule;
  readonly openAiCompat: OpenAiCompatModule;
}

export function createApiModules(dependencies: ApiDependencies): ApiModules {
  const { chatCompletionClient, clock, config, httpFetch } = dependencies;

  return {
    system: createSystemModule({ clock, webPort: config.webPort }),
    generation: createGenerationModule({
      chatCompletionClient,
      // TODO: wire to modules.providers once it is composed (F-40)
      providers: {
        resolveGenerationProviderEndpoint: () => resolveGenerationProviderEndpoint(),
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
      // TODO: wire to dependencies.tokenCounter once it is composed (F-35)
      tokenCounter: getProviderTokenCounter(),
    }),
  };
}
