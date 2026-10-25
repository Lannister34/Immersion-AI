import type { ProviderConnectionResponse } from '@immersion/contracts/providers';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { FakeChatCompletionClient } from '../../test-support/fake-chat-completion-client.js';
import { createManualClock } from '../../test-support/manual-clock.js';
import { OpenAiErrorFixtureSchema } from '../../test-support/openai-response-fixture-schemas.js';
import { heuristicTokenCounter } from '../prompting/index.js';
import { GenerationProviderUnavailableError } from '../providers/index.js';
import type { OpenAiCompatProvidersPort } from './application/openai-compat-ports.js';
import { createOpenAiCompatModule } from './index.js';

const NO_MODEL_CATALOG: ProviderConnectionResponse = {
  activeProvider: 'custom',
  endpoint: 'http://127.0.0.1:6007/v1/models',
  issue: { code: 'provider_http_error', message: 'Provider returned HTTP 404.' },
  mode: 'external',
  models: [],
  status: 'error',
};

async function listModels(endpointFailure: Error) {
  const providers: OpenAiCompatProvidersPort = {
    resolveGenerationProviderEndpoint: () => Promise.reject(endpointFailure),
    testConnection: () => Promise.resolve(NO_MODEL_CATALOG),
  };
  const module = createOpenAiCompatModule({
    chatCompletionClient: new FakeChatCompletionClient(),
    clock: createManualClock(),
    providers,
    settings: {
      resolveSamplerPresetForModel: () => {
        throw new Error('GET /v1/models reads no sampler preset.');
      },
    },
    tokenCounter: heuristicTokenCounter,
  });
  const app = Fastify();
  await app.register(module.routes, { prefix: '/v1' });
  const response = await app.inject({ method: 'GET', url: '/v1/models' });
  await app.close();

  return response;
}

describe('GET /v1/models without a provider model catalog', () => {
  it('lists no models when no provider is configured', async () => {
    const response = await listModels(new GenerationProviderUnavailableError('Встроенный сервер не запущен.'));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], object: 'list' });
  });

  it('answers with an error instead of an empty list when the configured model cannot be read', async () => {
    const response = await listModels(new Error('EACCES: user-settings.json'));

    expect(response.statusCode).toBe(500);
    expect(OpenAiErrorFixtureSchema.parse(response.json()).error).toEqual({
      code: 'internal_error',
      message: 'EACCES: user-settings.json',
      type: 'server_error',
    });
  });
});
