import { SaveScenarioCommandSchema, ScenarioDetailResponseSchema } from '@immersion/contracts/scenarios';
import type { FastifyPluginAsync } from 'fastify';

import { parseRequest } from '../../../../platform/http/parse-request.js';
import { deleteScenario } from '../../application/delete-scenario.js';
import { getScenario } from '../../application/get-scenario.js';
import { listScenarios } from '../../application/list-scenarios.js';
import { createScenario, updateScenario } from '../../application/save-scenario.js';
import { ScenarioRouteParamsSchema } from './request-schemas.js';

export const scenariosRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => listScenarios());

  app.post('/', async (request, reply) => {
    const command = parseRequest(SaveScenarioCommandSchema, request.body);
    const scenario = await createScenario(command);

    return reply.status(201).send(ScenarioDetailResponseSchema.parse({ scenario }));
  });

  app.get('/:scenarioId', async (request) => {
    const { scenarioId } = parseRequest(ScenarioRouteParamsSchema, request.params);
    const scenario = await getScenario(scenarioId);

    return ScenarioDetailResponseSchema.parse({ scenario });
  });

  app.put('/:scenarioId', async (request) => {
    const { scenarioId } = parseRequest(ScenarioRouteParamsSchema, request.params);
    const command = parseRequest(SaveScenarioCommandSchema, request.body);
    const scenario = await updateScenario(scenarioId, command);

    return ScenarioDetailResponseSchema.parse({ scenario });
  });

  app.delete('/:scenarioId', async (request, reply) => {
    const { scenarioId } = parseRequest(ScenarioRouteParamsSchema, request.params);
    await deleteScenario(scenarioId);

    return reply.status(204).send();
  });
};
