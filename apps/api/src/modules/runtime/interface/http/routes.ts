import type { FastifyPluginAsync } from 'fastify';

import { createToProblem, problem } from '../../../../shared/interface/http/problem.js';
import { getRuntimeLogs } from '../../application/get-runtime-logs.js';
import { getRuntimeOverview } from '../../application/get-runtime-overview.js';
import { installRuntime } from '../../application/install-runtime.js';
import { startRuntime } from '../../application/start-runtime.js';
import { stopRuntime } from '../../application/stop-runtime.js';
import { updateRuntimeConfig } from '../../application/update-runtime-config.js';

const toProblem = createToProblem(
  (error) => {
    if (error instanceof Error && error.message.startsWith('Model not found:')) {
      return problem(400, 'validation_error', error.message);
    }

    if (error instanceof Error && error.message.includes('llama-server не найден')) {
      return problem(409, 'runtime_unavailable', error.message);
    }

    if (error instanceof Error && error.message.includes('llama.cpp')) {
      return problem(502, 'runtime_install_failed', error.message);
    }

    return null;
  },
  { exposeInternalErrorMessage: true },
);

export const runtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async () => getRuntimeOverview());

  app.get('/logs', async () => getRuntimeLogs());

  app.put('/config', async (request, reply) => {
    try {
      return await updateRuntimeConfig(request.body);
    } catch (error) {
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/start', async (request, reply) => {
    try {
      return await startRuntime(request.body);
    } catch (error) {
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/stop', async (_request, reply) => {
    try {
      return await stopRuntime();
    } catch (error) {
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/install', async (request, reply) => {
    try {
      return await installRuntime(request.body);
    } catch (error) {
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
};
