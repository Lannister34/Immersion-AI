import cors from '@fastify/cors';
import Fastify from 'fastify';

import type { ApiConfig } from './config/api-config.js';
import { readApiConfig } from './config/read-api-config.js';
import { buildApiLogger } from './lib/logger.js';
import { charactersRoutes } from './modules/characters/interface/http/routes.js';
import { chatsRoutes } from './modules/chats/interface/http/routes.js';
import { generationRoutes } from './modules/generation/interface/http/routes.js';
import { lorebooksRoutes } from './modules/lorebooks/interface/http/routes.js';
import { openAiCompatRoutes } from './modules/openai-compat/interface/http/routes.js';
import { providersRoutes } from './modules/providers/interface/http/routes.js';
import { runtimeRoutes } from './modules/runtime/interface/http/routes.js';
import { scenariosRoutes } from './modules/scenarios/interface/http/routes.js';
import { settingsRoutes } from './modules/settings/interface/http/routes.js';
import { healthRoute } from './routes/health.js';
import { rootRoute } from './routes/root.js';

const API_BODY_LIMIT_BYTES = 16 * 1024 * 1024;

// TODO: require the config once every test builds apps through the harness (F-13)
export function buildApiApp(config: ApiConfig = readApiConfig()) {
  const app = Fastify({
    bodyLimit: API_BODY_LIMIT_BYTES,
    loggerInstance: buildApiLogger(config.logLevel),
  });

  app.register(cors, {
    origin: [...config.webOrigins],
  });
  app.register(rootRoute, { webPort: config.webPort });
  app.register(healthRoute, { prefix: '/health' });
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
