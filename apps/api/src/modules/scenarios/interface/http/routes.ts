import { ApiProblemSchema } from '@immersion/contracts/common';
import {
  SaveScenarioCommandSchema,
  ScenarioDetailResponseSchema,
  ScenarioIdSchema,
} from '@immersion/contracts/scenarios';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';

import { deleteScenario } from '../../application/delete-scenario.js';
import { getScenario, ScenarioNotFoundError } from '../../application/get-scenario.js';
import { listScenarios } from '../../application/list-scenarios.js';
import { createScenario, updateScenario } from '../../application/save-scenario.js';

const ScenarioRouteParamsSchema = z.object({
  scenarioId: ScenarioIdSchema,
});

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

  if (error instanceof ScenarioNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'scenario_not_found',
        message: 'Scenario not found.',
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

  app.post('/', async (request, reply) => {
    try {
      const command = SaveScenarioCommandSchema.parse(request.body);
      const scenario = await createScenario(command);
      return reply.status(201).send(ScenarioDetailResponseSchema.parse({ scenario }));
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create scenario');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.get('/:scenarioId', async (request, reply) => {
    try {
      const { scenarioId } = ScenarioRouteParamsSchema.parse(request.params);
      const scenario = await getScenario(scenarioId);
      return ScenarioDetailResponseSchema.parse({ scenario });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load scenario');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.put('/:scenarioId', async (request, reply) => {
    try {
      const { scenarioId } = ScenarioRouteParamsSchema.parse(request.params);
      const command = SaveScenarioCommandSchema.parse(request.body);
      const scenario = await updateScenario(scenarioId, command);
      return ScenarioDetailResponseSchema.parse({ scenario });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update scenario');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.delete('/:scenarioId', async (request, reply) => {
    try {
      const { scenarioId } = ScenarioRouteParamsSchema.parse(request.params);
      await deleteScenario(scenarioId);
      return reply.status(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete scenario');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });
};
