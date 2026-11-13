import type { ProviderConnectionResponse, ProviderSettingsSnapshot } from '@immersion/contracts/providers';
import type { FastifyPluginAsync } from 'fastify';

import type { HttpFetch } from '../../platform/outbound-http/http-fetch.js';
import type { UserSettingsDocument } from '../settings/index.js';
import {
  type GenerationProviderEndpoint,
  resolveGenerationProviderEndpoint,
} from './application/generation-provider.js';
import { getProviderSettings } from './application/get-provider-settings.js';
import { ProviderSettingsRepository } from './application/provider-settings-repository.js';
import type { RuntimeEndpointPort } from './application/runtime-endpoint-port.js';
import { testProviderConnection } from './application/test-provider-connection.js';
import { createProvidersRoutes, type ProvidersRoutesDependencies } from './interface/http/routes.js';

export interface ProvidersModuleDependencies {
  readonly settingsDocument: UserSettingsDocument;
  readonly httpFetch: HttpFetch;
  readonly runtimeEndpoint: RuntimeEndpointPort;
}

export interface ProvidersModule {
  readonly routes: FastifyPluginAsync;
  getProviderSettings(): Promise<ProviderSettingsSnapshot>;
  resolveGenerationProviderEndpoint(): Promise<GenerationProviderEndpoint>;
  testConnection(): Promise<ProviderConnectionResponse>;
}

export function createProvidersModule({
  httpFetch,
  runtimeEndpoint,
  settingsDocument,
}: ProvidersModuleDependencies): ProvidersModule {
  const dependencies: ProvidersRoutesDependencies = {
    httpFetch,
    providerSettings: new ProviderSettingsRepository({ document: settingsDocument }),
    runtimeEndpoint,
  };

  return {
    routes: createProvidersRoutes(dependencies),
    getProviderSettings: () => getProviderSettings(dependencies),
    resolveGenerationProviderEndpoint: () => resolveGenerationProviderEndpoint(dependencies),
    testConnection: () => testProviderConnection(dependencies),
  };
}
