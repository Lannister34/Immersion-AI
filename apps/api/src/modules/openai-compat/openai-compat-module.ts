import type { FastifyPluginAsync } from 'fastify';

import { createOpenAiCompatRoutes, type OpenAiCompatRoutesDependencies } from './interface/http/routes.js';

export type OpenAiCompatModuleDependencies = OpenAiCompatRoutesDependencies;

export interface OpenAiCompatModule {
  readonly routes: FastifyPluginAsync;
}

export function createOpenAiCompatModule(dependencies: OpenAiCompatModuleDependencies): OpenAiCompatModule {
  return {
    routes: createOpenAiCompatRoutes(dependencies),
  };
}
