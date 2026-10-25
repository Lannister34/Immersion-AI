import { describe, expect, it, vi } from 'vitest';

import { useTestApi } from '../../test-support/use-test-api.js';
import { runtimeEndpointAdapter } from './infrastructure/runtime-endpoint-adapter.js';

describe('providers problems', () => {
  const api = useTestApi();

  it('reports an unsupported provider URL protocol as 409 generation_provider_unavailable', async () => {
    await api().settings.write({ backendMode: 'builtin' });
    vi.spyOn(runtimeEndpointAdapter, 'getRunningEndpoint').mockResolvedValue({
      baseUrl: 'ftp://127.0.0.1:5001',
      model: null,
      visionProjectorPath: null,
    });
    const { app, http, logs } = api();

    const response = await app.inject({ method: 'GET', url: '/api/providers/connection' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'generation_provider_unavailable',
      message: 'Provider URL is invalid: ftp://127.0.0.1:5001',
    });
    expect(http.requests).toEqual([]);
    expect(logs.lines.filter((line) => line.level === 'error')).toEqual([]);
  });
});
