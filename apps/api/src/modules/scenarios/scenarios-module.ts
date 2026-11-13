import type { ScenarioDetailDto } from '@immersion/contracts/scenarios';
import type { FastifyPluginAsync } from 'fastify';

import { getScenario } from './application/get-scenario.js';
import { createScenariosRoutes, type ScenariosRoutesDependencies } from './interface/http/routes.js';

export type ScenariosModuleDependencies = ScenariosRoutesDependencies;

export interface ScenariosModule {
  readonly routes: FastifyPluginAsync;
  findScenario(scenarioId: string): Promise<ScenarioDetailDto | null>;
  getScenario(scenarioId: string): Promise<ScenarioDetailDto>;
}

export function createScenariosModule(dependencies: ScenariosModuleDependencies): ScenariosModule {
  return {
    routes: createScenariosRoutes(dependencies),
    findScenario: (scenarioId) => dependencies.scenarioStore.readScenarioDetail(scenarioId),
    getScenario: (scenarioId) => getScenario(scenarioId, dependencies),
  };
}
