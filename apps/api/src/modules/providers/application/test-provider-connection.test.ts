import { describe, expect, it } from 'vitest';

import { createHttpStub } from '../../../test-support/http-stub.js';
import { useTemporaryDataRoot } from '../../../test-support/use-temporary-data-root.js';
import { createUserSettingsFixtureFile } from '../../../test-support/user-settings-fixture.js';
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

describe('testProviderConnection', () => {
  const dataRoot = useTemporaryDataRoot();

  it('asks the running builtin server for its models through the injected HTTP port', async () => {
    await createUserSettingsFixtureFile(dataRoot()).write({ backendMode: 'builtin' });
    const http = createHttpStub();
    http.on('GET', 'http://127.0.0.1:5001/v1/models', () => Response.json({ data: [{ id: 'qwen3-8b' }] }));

    const response = await testProviderConnection({ httpFetch: http.fetch, runtimeEndpointPort: RUNNING_BUILTIN });

    expect(http.requestLines()).toEqual(['GET http://127.0.0.1:5001/v1/models']);
    expect(response).toMatchObject({ mode: 'builtin', models: [{ id: 'qwen3-8b' }], status: 'ok' });
  });

  it('asks the configured external provider through the injected HTTP port with the stored key', async () => {
    await createUserSettingsFixtureFile(dataRoot()).useExternalProvider({
      apiKey: 'sk-local-test',
      url: 'http://127.0.0.1:6001',
    });
    const http = createHttpStub();
    http.on('GET', 'http://127.0.0.1:6001/v1/models', () => Response.json({ data: [{ id: 'local-model' }] }));

    const response = await testProviderConnection({ httpFetch: http.fetch });

    expect(http.requestLines()).toEqual(['GET http://127.0.0.1:6001/v1/models']);
    expect(http.requests[0]?.headers.get('Authorization')).toBe('Bearer sk-local-test');
    expect(response).toMatchObject({ mode: 'external', models: [{ id: 'local-model' }], status: 'ok' });
  });

  it('reports a provider the HTTP port cannot reach as provider_unreachable', async () => {
    await createUserSettingsFixtureFile(dataRoot()).useExternalProvider({ url: 'http://127.0.0.1:6001' });
    const http = createHttpStub();

    const response = await testProviderConnection({ httpFetch: http.fetch });

    expect(http.requestLines()).toEqual(['GET http://127.0.0.1:6001/v1/models']);
    expect(response).toMatchObject({ issue: { code: 'provider_unreachable' }, models: [], status: 'error' });
  });
});
