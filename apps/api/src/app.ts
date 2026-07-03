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

// Character card imports arrive as base64 JSON (up to ~10M characters), so the
// default 1 MiB Fastify body limit is far too small.
const API_BODY_LIMIT_BYTES = 16 * 1024 * 1024;

// Dev web server (4788) and Playwright smoke preview (4173).
const DEFAULT_WEB_ORIGINS = [
  'http://localhost:4788',
  'http://127.0.0.1:4788',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export function resolveAllowedWebOrigins(): string[] {
  const configured = process.env.IMMERSION_WEB_ORIGINS;

  if (!configured) {
    return DEFAULT_WEB_ORIGINS;
  }

  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : DEFAULT_WEB_ORIGINS;
}

export function buildApiApp() {
  const app = Fastify({
    bodyLimit: API_BODY_LIMIT_BYTES,
    loggerInstance: buildApiLogger(),
  });

  app.register(cors, {
    origin: resolveAllowedWebOrigins(),
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
