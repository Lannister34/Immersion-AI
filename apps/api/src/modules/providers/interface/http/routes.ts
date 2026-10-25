import {
  PatchProviderSettingsCommandSchema,
  ProviderModelsProbeCommandSchema,
  UpdateProviderSettingsCommandSchema,
} from '@immersion/contracts/providers';
import type { FastifyPluginAsync } from 'fastify';

import { parseRequest } from '../../../../platform/http/parse-request.js';
import { globalHttpFetch } from '../../../../platform/outbound-http/global-http-fetch.js';
import { getProviderSettings } from '../../application/get-provider-settings.js';
import { getProvidersOverview } from '../../application/get-providers-overview.js';
import { patchProviderSettings } from '../../application/patch-provider-settings.js';
import { probeProviderModels } from '../../application/probe-provider-models.js';
import { testProviderConnection } from '../../application/test-provider-connection.js';
import { updateProviderSettings } from '../../application/update-provider-settings.js';
import { providerDefinitions } from '../../domain/provider-catalog.js';

export const providersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async () => getProvidersOverview());

  app.get('/definitions', async () => {
    return {
      items: providerDefinitions,
    };
  });

  // TODO: take the HttpFetch from the providers module dependencies (F-40)
  app.get('/connection', async () => testProviderConnection({ httpFetch: globalHttpFetch }));

  app.post('/models', async (request) => {
    const command = parseRequest(ProviderModelsProbeCommandSchema, request.body);

    // TODO: take the HttpFetch from the providers module dependencies (F-40)
    return probeProviderModels(command, { httpFetch: globalHttpFetch });
  });

  app.get('/settings', async () => getProviderSettings());

  app.put('/settings', async (request) => {
    const command = parseRequest(UpdateProviderSettingsCommandSchema, request.body);

    return updateProviderSettings(command);
  });

  app.patch('/settings', async (request) => {
    const command = parseRequest(PatchProviderSettingsCommandSchema, request.body);

    return patchProviderSettings(command);
  });
};
