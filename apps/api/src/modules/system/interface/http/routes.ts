import { HealthResponseSchema } from '@immersion/contracts';
import type { FastifyPluginAsync } from 'fastify';

import type { Clock } from '../../../../platform/clock/clock.js';
import { resolveWebRedirectUrl } from './web-redirect-url.js';

export interface SystemRoutesDependencies {
  readonly clock: Clock;
  readonly webPort: number;
}

export function createSystemRoutes({ clock, webPort }: SystemRoutesDependencies): FastifyPluginAsync {
  const healthRoutes: FastifyPluginAsync = async (health) => {
    health.get('/', async () => {
      return HealthResponseSchema.parse({
        status: 'ok',
        service: 'api',
        timestamp: clock.now().toISOString(),
      });
    });
  };

  return async (app) => {
    app.get('/', async (request, reply) => {
      return reply.redirect(resolveWebRedirectUrl(request.headers.host, webPort));
    });
    await app.register(healthRoutes, { prefix: '/health' });
  };
}
