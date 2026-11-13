import { describe, expect, it } from 'vitest';

import { createHttpStub } from '../../../test-support/http-stub.js';
import { createInMemoryUserSettings } from '../../../test-support/in-memory-user-settings.js';
import type { UserSettingsRecord } from '../../settings/index.js';
import { ProviderSettingsRepository } from './provider-settings-repository.js';
import type { RuntimeEndpointPort } from './runtime-endpoint-port.js';
import { testProviderConnection } from './test-provider-connection.js';

const RUNNING_BUILTIN: RuntimeEndpointPort = {
  getRunningEndpoint: () =>
    Promise.resolve({
      baseUrl: 'http://127.0.0.1:5001',
      contextSize: null,
      model: 'qwen3-8b.gguf',
      visionProjectorPath: null,
    }),
};

const NOTHING_RUNNING: RuntimeEndpointPort = { getRunningEndpoint: () => Promise.resolve(null) };

function providerSettingsOf(stored: UserSettingsRecord): ProviderSettingsRepository {
  return new ProviderSettingsRepository({ document: createInMemoryUserSettings(stored) });
}

describe('testProviderConnection', () => {
  it('asks the running builtin server for its models through the injected HTTP port', async () => {
    const http = createHttpStub();
    http.on('GET', 'http://127.0.0.1:5001/v1/models', () => Response.json({ data: [{ id: 'qwen3-8b' }] }));

    const response = await testProviderConnection({
      httpFetch: http.fetch,
      providerSettings: providerSettingsOf({ backendMode: 'builtin' }),
      runtimeEndpoint: RUNNING_BUILTIN,
    });

    expect(http.requestLines()).toEqual(['GET http://127.0.0.1:5001/v1/models']);
    expect(response).toMatchObject({ mode: 'builtin', models: [{ id: 'qwen3-8b' }], status: 'ok' });
  });

  it('asks the configured external provider through the injected HTTP port with the stored key', async () => {
    const http = createHttpStub();
    http.on('GET', 'http://127.0.0.1:6001/v1/models', () => Response.json({ data: [{ id: 'local-model' }] }));

    const response = await testProviderConnection({
      httpFetch: http.fetch,
      providerSettings: providerSettingsOf({
        activeProvider: 'custom',
        backendMode: 'external',
        providerConfigs: { custom: { apiKey: 'sk-local-test', url: 'http://127.0.0.1:6001' } },
      }),
      runtimeEndpoint: NOTHING_RUNNING,
    });

    expect(http.requestLines()).toEqual(['GET http://127.0.0.1:6001/v1/models']);
    expect(http.requests[0]?.headers.get('Authorization')).toBe('Bearer sk-local-test');
    expect(response).toMatchObject({ mode: 'external', models: [{ id: 'local-model' }], status: 'ok' });
  });

  it('reports a provider the HTTP port cannot reach as provider_unreachable', async () => {
    const http = createHttpStub();

    const response = await testProviderConnection({
      httpFetch: http.fetch,
      providerSettings: providerSettingsOf({
        activeProvider: 'custom',
        backendMode: 'external',
        providerConfigs: { custom: { url: 'http://127.0.0.1:6001' } },
      }),
      runtimeEndpoint: NOTHING_RUNNING,
    });

    expect(http.requestLines()).toEqual(['GET http://127.0.0.1:6001/v1/models']);
    expect(response).toMatchObject({ issue: { code: 'provider_unreachable' }, models: [], status: 'error' });
  });
});
