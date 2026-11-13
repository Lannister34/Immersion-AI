import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { installProblemHandler } from '../../platform/http/problem-handler.js';
import { createProblemTable } from '../../platform/http/problem-table.js';
import { createCapturingLogger } from '../../test-support/capturing-logger.js';
import { createHttpStub } from '../../test-support/http-stub.js';
import { createInMemoryUserSettings } from '../../test-support/in-memory-user-settings.js';
import { createProvidersModule, providersProblems } from './index.js';

describe('providers problems', () => {
  it('reports an unsupported provider URL protocol as 409 generation_provider_unavailable', async () => {
    const http = createHttpStub();
    const logs = createCapturingLogger();
    const providers = createProvidersModule({
      httpFetch: http.fetch,
      runtimeEndpoint: {
        getRunningEndpoint: () =>
          Promise.resolve({
            baseUrl: 'ftp://127.0.0.1:5001',
            contextSize: null,
            model: null,
            visionProjectorPath: null,
          }),
      },
      settingsDocument: createInMemoryUserSettings({ backendMode: 'builtin' }),
    });
    const app = Fastify({ loggerInstance: logs.logger });
    installProblemHandler(app, { table: createProblemTable(providersProblems) });
    await app.register(providers.routes, { prefix: '/api/providers' });

    const response = await app.inject({ method: 'GET', url: '/api/providers/connection' });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'generation_provider_unavailable',
      message: 'Provider URL is invalid: ftp://127.0.0.1:5001',
    });
    expect(http.requests).toEqual([]);
    expect(logs.lines.filter((line) => line.level === 'error')).toEqual([]);
  });
});
