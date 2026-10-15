import type { FastifyPluginAsync } from 'fastify';

import { createSystemRoutes, type SystemRoutesDependencies } from './interface/http/routes.js';

export type SystemModuleDependencies = SystemRoutesDependencies;

export interface SystemModule {
  readonly routes: FastifyPluginAsync;
}

export function createSystemModule(dependencies: SystemModuleDependencies): SystemModule {
  return {
    routes: createSystemRoutes(dependencies),
  };
}
