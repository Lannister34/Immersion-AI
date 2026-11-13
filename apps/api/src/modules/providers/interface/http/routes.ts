import { PatchProviderSettingsCommandSchema, ProviderModelsProbeCommandSchema } from '@immersion/contracts/providers';
import type { FastifyPluginAsync } from 'fastify';

import { parseRequest } from '../../../../platform/http/parse-request.js';
import { getProviderSettings } from '../../application/get-provider-settings.js';
import { getProvidersOverview } from '../../application/get-providers-overview.js';
import { patchProviderSettings } from '../../application/patch-provider-settings.js';
import { probeProviderModels } from '../../application/probe-provider-models.js';
import type { ProviderSettingsRepository } from '../../application/provider-settings-repository.js';
import { testProviderConnection } from '../../application/test-provider-connection.js';
import type { TestProviderConnectionDependencies } from '../../application/test-provider-connection-dependencies.js';
import { providerDefinitions } from '../../domain/provider-catalog.js';

export interface ProvidersRoutesDependencies extends TestProviderConnectionDependencies {
  readonly providerSettings: ProviderSettingsRepository;
}

export function createProvidersRoutes(dependencies: ProvidersRoutesDependencies): FastifyPluginAsync {
  return async (app) => {
    app.get('/overview', async () => getProvidersOverview(dependencies));

    app.get('/definitions', async () => {
      return {
        items: providerDefinitions,
      };
    });

    app.get('/connection', async () => testProviderConnection(dependencies));

    app.post('/models', async (request) => {
      const command = parseRequest(ProviderModelsProbeCommandSchema, request.body);

      return probeProviderModels(command, dependencies);
    });

    app.get('/settings', async () => getProviderSettings(dependencies));

    app.patch('/settings', async (request) => {
      const command = parseRequest(PatchProviderSettingsCommandSchema, request.body);

      return patchProviderSettings(command, dependencies);
    });
  };
}
