import cors from '@fastify/cors';
import Fastify from 'fastify';

import { type ApiDependencies, createApiDependencies } from './composition/api-dependencies.js';
import { type ApiModules, createApiModules } from './composition/create-api-modules.js';
import { readApiConfig } from './config/read-api-config.js';
import { charactersRoutes } from './modules/characters/index.js';
import { chatsRoutes } from './modules/chats/index.js';
import { generationRoutes } from './modules/generation/index.js';
import { lorebooksRoutes } from './modules/lorebooks/index.js';
import { openAiCompatRoutes } from './modules/openai-compat/index.js';
import { providersRoutes } from './modules/providers/index.js';
import { runtimeRoutes } from './modules/runtime/index.js';
import { scenariosRoutes } from './modules/scenarios/index.js';
import { settingsRoutes } from './modules/settings/index.js';

const API_BODY_LIMIT_BYTES = 16 * 1024 * 1024;

// TODO: require the dependencies and the modules once every test builds apps through the harness (F-13)
export function buildApiApp(
  dependencies: ApiDependencies = createApiDependencies(readApiConfig()),
  modules: ApiModules = createApiModules(dependencies),
) {
  const app = Fastify({
    bodyLimit: API_BODY_LIMIT_BYTES,
    loggerInstance: dependencies.logger,
  });

  app.register(cors, {
    origin: [...dependencies.config.webOrigins],
  });
  app.register(modules.system.routes);
  app.register(charactersRoutes, { prefix: '/api/characters' });
  app.register(chatsRoutes, { prefix: '/api/chats' });
  app.register(generationRoutes, { prefix: '/api/generation' });
  app.register(lorebooksRoutes, { prefix: '/api/lorebooks' });
  app.register(scenariosRoutes, { prefix: '/api/scenarios' });
  app.register(settingsRoutes, { prefix: '/api/settings' });
  app.register(providersRoutes, { prefix: '/api/providers' });
  app.register(runtimeRoutes, { prefix: '/api/runtime' });
  app.register(openAiCompatRoutes, { prefix: '/v1' });

  return app;
}
