import cors from '@fastify/cors';
import Fastify from 'fastify';

import { buildApiLogger } from './lib/logger.js';
import { charactersRoutes } from './modules/characters/interface/http/routes.js';
import { chatsRoutes } from './modules/chats/interface/http/routes.js';
import { generationRoutes } from './modules/generation/interface/http/routes.js';
import { lorebooksRoutes } from './modules/lorebooks/interface/http/routes.js';
import { providersRoutes } from './modules/providers/interface/http/routes.js';
import { runtimeRoutes } from './modules/runtime/interface/http/routes.js';
import { scenariosRoutes } from './modules/scenarios/interface/http/routes.js';
import { settingsRoutes } from './modules/settings/interface/http/routes.js';
import { healthRoute } from './routes/health.js';
import { rootRoute } from './routes/root.js';

export function buildApiApp() {
  const app = Fastify({
    loggerInstance: buildApiLogger(),
  });

  app.register(cors, {
    origin: true,
  });
  app.register(rootRoute);
  app.register(healthRoute, { prefix: '/health' });
  app.register(charactersRoutes, { prefix: '/api/characters' });
  app.register(chatsRoutes, { prefix: '/api/chats' });
  app.register(generationRoutes, { prefix: '/api/generation' });
  app.register(lorebooksRoutes, { prefix: '/api/lorebooks' });
  app.register(scenariosRoutes, { prefix: '/api/scenarios' });
  app.register(settingsRoutes, { prefix: '/api/settings' });
  app.register(providersRoutes, { prefix: '/api/providers' });
  app.register(runtimeRoutes, { prefix: '/api/runtime' });

  return app;
}
