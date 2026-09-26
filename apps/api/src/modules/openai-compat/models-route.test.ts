import type { ProviderConnectionResponse } from '@immersion/contracts/providers';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GenerationProviderUnavailableError,
  type resolveGenerationProviderEndpoint,
  type testProviderConnection,
} from '../providers/index.js';
import { openAiCompatRoutes } from './index.js';

const providerDoubles = vi.hoisted(() => ({
  resolveGenerationProviderEndpoint: vi.fn<typeof resolveGenerationProviderEndpoint>(),
  testProviderConnection: vi.fn<typeof testProviderConnection>(),
}));

vi.mock('../providers/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../providers/index.js')>()),
  resolveGenerationProviderEndpoint: providerDoubles.resolveGenerationProviderEndpoint,
  testProviderConnection: providerDoubles.testProviderConnection,
}));

const NO_MODEL_CATALOG: ProviderConnectionResponse = {
  activeProvider: 'custom',
  endpoint: 'http://127.0.0.1:6007/v1/models',
  issue: { code: 'provider_http_error', message: 'Provider returned HTTP 404.' },
  mode: 'external',
  models: [],
  status: 'error',
};

async function listModels() {
  const app = Fastify();
  await app.register(openAiCompatRoutes, { prefix: '/v1' });
  const response = await app.inject({ method: 'GET', url: '/v1/models' });
  await app.close();

  return response;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('GET /v1/models without a provider model catalog', () => {
  it('lists no models when no provider is configured', async () => {
    providerDoubles.testProviderConnection.mockResolvedValue(NO_MODEL_CATALOG);
    providerDoubles.resolveGenerationProviderEndpoint.mockRejectedValue(
      new GenerationProviderUnavailableError('Встроенный сервер не запущен.'),
    );

    const response = await listModels();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], object: 'list' });
  });

  it('answers with an error instead of an empty list when the configured model cannot be read', async () => {
    providerDoubles.testProviderConnection.mockResolvedValue(NO_MODEL_CATALOG);
    providerDoubles.resolveGenerationProviderEndpoint.mockRejectedValue(new Error('EACCES: user-settings.json'));

    const response = await listModels();

    expect(response.statusCode).toBe(500);
    expect(response.json().message).toBe('EACCES: user-settings.json');
  });
});
