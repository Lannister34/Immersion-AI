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
  app.register(modules.characters.routes, { prefix: '/api/characters' });
  app.register(modules.chats.routes, { prefix: '/api/chats' });
  app.register(modules.generation.routes, { prefix: '/api/generation' });
  app.register(modules.lorebooks.routes, { prefix: '/api/lorebooks' });
  app.register(modules.scenarios.routes, { prefix: '/api/scenarios' });
  app.register(settingsRoutes, { prefix: '/api/settings' });
  app.register(modules.providers.routes, { prefix: '/api/providers' });
  app.register(modules.runtime.routes, { prefix: '/api/runtime' });
  app.register(modules.openAiCompat.routes, { prefix: '/v1' });
  app.addHook('onClose', () => {
    modules.generation.close();
    modules.runtime.close();
  });

  return app;
}
