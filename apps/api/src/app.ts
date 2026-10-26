import cors from '@fastify/cors';
import Fastify, {
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';

import type { ApiDependencies } from './composition/api-dependencies.js';
import { apiProblems } from './composition/api-problems.js';
import type { ApiModules } from './composition/create-api-modules.js';
import { charactersRoutes } from './modules/characters/index.js';
import { chatsRoutes } from './modules/chats/index.js';
import { lorebooksRoutes } from './modules/lorebooks/index.js';
import { providersRoutes } from './modules/providers/index.js';
import { runtimeRoutes } from './modules/runtime/index.js';
import { scenariosRoutes } from './modules/scenarios/index.js';
import { settingsRoutes } from './modules/settings/index.js';
import { installNotFoundHandler, installProblemHandler } from './platform/http/problem-handler.js';
import type { ApiLogger } from './platform/logging/api-logger.js';

const API_BODY_LIMIT_BYTES = 16 * 1024 * 1024;

export type ApiApp = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  ApiLogger
>;

export function buildApiApp(dependencies: ApiDependencies, modules: ApiModules): ApiApp {
  const app = Fastify({
    bodyLimit: API_BODY_LIMIT_BYTES,
    loggerInstance: dependencies.logger,
  });

  installProblemHandler(app, { table: apiProblems });
  installNotFoundHandler(app);
  app.register(cors, {
    origin: [...dependencies.config.webOrigins],
  });
  app.register(modules.system.routes);
  app.register(charactersRoutes, { prefix: '/api/characters' });
  app.register(chatsRoutes, { prefix: '/api/chats' });
  app.register(modules.generation.routes, { prefix: '/api/generation' });
  app.register(lorebooksRoutes, { prefix: '/api/lorebooks' });
  app.register(scenariosRoutes, { prefix: '/api/scenarios' });
  app.register(settingsRoutes, { prefix: '/api/settings' });
  app.register(providersRoutes, { prefix: '/api/providers' });
  app.register(runtimeRoutes, { prefix: '/api/runtime' });
  app.register(modules.openAiCompat.routes, { prefix: '/v1' });
  app.addHook('onClose', () => modules.generation.close());

  return app;
}
