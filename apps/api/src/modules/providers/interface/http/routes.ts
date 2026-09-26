import { ProviderModelsProbeCommandSchema } from '@immersion/contracts/providers';
import type { FastifyPluginAsync } from 'fastify';
import { createToProblem } from '../../../../shared/interface/http/problem.js';
import { getProviderSettings } from '../../application/get-provider-settings.js';
import { getProvidersOverview } from '../../application/get-providers-overview.js';
import { patchProviderSettings } from '../../application/patch-provider-settings.js';
import { probeProviderModels, testProviderConnection } from '../../application/test-provider-connection.js';
import { updateProviderSettings } from '../../application/update-provider-settings.js';
import { providerDefinitions } from '../../domain/provider-catalog.js';

const toProblem = createToProblem(undefined, { exposeInternalErrorMessage: true });

export const providersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async () => getProvidersOverview());

  app.get('/definitions', async () => {
    return {
      items: providerDefinitions,
    };
  });

  app.get('/connection', async (_request, reply) => {
    try {
      return await testProviderConnection();
    } catch (error) {
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/models', async (request, reply) => {
    try {
      return await probeProviderModels(ProviderModelsProbeCommandSchema.parse(request.body));
    } catch (error) {
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/settings', async (_request, reply) => {
    try {
      // The stored apiKey is returned on purpose: the settings form round-trips it.
      // The API binds to 127.0.0.1 by default and CORS is limited to local web origins.
      return await getProviderSettings();
    } catch (error) {
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.put('/settings', async (request, reply) => {
    try {
      return await updateProviderSettings(request.body);
    } catch (error) {
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.patch('/settings', async (request, reply) => {
    try {
      return await patchProviderSettings(request.body);
    } catch (error) {
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
};
