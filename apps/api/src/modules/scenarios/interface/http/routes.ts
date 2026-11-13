import { SaveScenarioCommandSchema, ScenarioDetailResponseSchema } from '@immersion/contracts/scenarios';
import type { FastifyPluginAsync } from 'fastify';

import type { Clock } from '../../../../platform/clock/clock.js';
import { parseRequest } from '../../../../platform/http/parse-request.js';
import { deleteScenario } from '../../application/delete-scenario.js';
import { getScenario } from '../../application/get-scenario.js';
import { listScenarios } from '../../application/list-scenarios.js';
import { createScenario, updateScenario } from '../../application/save-scenario.js';
import type { ScenarioStore } from '../../application/scenario-store.js';
import { ScenarioRouteParamsSchema } from './request-schemas.js';

export interface ScenariosRoutesDependencies {
  readonly clock: Clock;
  readonly scenarioStore: ScenarioStore;
}

export function createScenariosRoutes(dependencies: ScenariosRoutesDependencies): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async () => listScenarios(dependencies));

    app.post('/', async (request, reply) => {
      const command = parseRequest(SaveScenarioCommandSchema, request.body);
      const scenario = await createScenario(command, dependencies);

      return reply.status(201).send(ScenarioDetailResponseSchema.parse({ scenario }));
    });

    app.get('/:scenarioId', async (request) => {
      const { scenarioId } = parseRequest(ScenarioRouteParamsSchema, request.params);
      const scenario = await getScenario(scenarioId, dependencies);

      return ScenarioDetailResponseSchema.parse({ scenario });
    });

    app.put('/:scenarioId', async (request) => {
      const { scenarioId } = parseRequest(ScenarioRouteParamsSchema, request.params);
      const command = parseRequest(SaveScenarioCommandSchema, request.body);
      const scenario = await updateScenario(scenarioId, command, dependencies);

      return ScenarioDetailResponseSchema.parse({ scenario });
    });

    app.delete('/:scenarioId', async (request, reply) => {
      const { scenarioId } = parseRequest(ScenarioRouteParamsSchema, request.params);
      await deleteScenario(scenarioId, dependencies);

      return reply.status(204).send();
    });
  };
}
