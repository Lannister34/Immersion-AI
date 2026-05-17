import { ApiProblemSchema } from '@immersion/contracts/common';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';

import { listScenarios } from '../../application/list-scenarios.js';

function toProblem(error: unknown) {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: ApiProblemSchema.parse({
        code: 'validation_error',
        message: error.issues[0]?.message ?? 'Invalid request payload.',
      }),
    };
  }

  return {
    statusCode: 500,
    body: ApiProblemSchema.parse({
      code: 'internal_error',
      message: 'Unexpected error.',
    }),
  };
}

export const scenariosRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    try {
      return await listScenarios();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list scenarios');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });
};
