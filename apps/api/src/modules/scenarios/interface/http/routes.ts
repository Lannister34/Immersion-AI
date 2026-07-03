import {
  SaveScenarioCommandSchema,
  ScenarioDetailResponseSchema,
  ScenarioIdSchema,
} from '@immersion/contracts/scenarios';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createToProblem, problem } from '../../../../shared/interface/http/problem.js';
import { deleteScenario } from '../../application/delete-scenario.js';
import { getScenario, ScenarioNotFoundError } from '../../application/get-scenario.js';
import { listScenarios } from '../../application/list-scenarios.js';
import { createScenario, updateScenario } from '../../application/save-scenario.js';

const ScenarioRouteParamsSchema = z.object({
  scenarioId: ScenarioIdSchema,
});

const toProblem = createToProblem((error) => {
  if (error instanceof ScenarioNotFoundError) {
    return problem(404, 'scenario_not_found', 'Scenario not found.');
  }

  return null;
});

export const scenariosRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    try {
      return await listScenarios();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list scenarios');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/', async (request, reply) => {
    try {
      const command = SaveScenarioCommandSchema.parse(request.body);
      const scenario = await createScenario(command);
      return reply.status(201).send(ScenarioDetailResponseSchema.parse({ scenario }));
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create scenario');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/:scenarioId', async (request, reply) => {
    try {
      const { scenarioId } = ScenarioRouteParamsSchema.parse(request.params);
      const scenario = await getScenario(scenarioId);
      return ScenarioDetailResponseSchema.parse({ scenario });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load scenario');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
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
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.delete('/:scenarioId', async (request, reply) => {
    try {
      const { scenarioId } = ScenarioRouteParamsSchema.parse(request.params);
      await deleteScenario(scenarioId);
      return reply.status(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete scenario');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
};
