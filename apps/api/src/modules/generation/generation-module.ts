import type { FastifyPluginAsync } from 'fastify';

import { createGenerationRoutes, type GenerationRoutesDependencies } from './interface/http/routes.js';

export type GenerationModuleDependencies = GenerationRoutesDependencies;

export interface GenerationModule {
  readonly routes: FastifyPluginAsync;
  close(): Promise<void>;
}

export function createGenerationModule(dependencies: GenerationModuleDependencies): GenerationModule {
  return {
    routes: createGenerationRoutes(dependencies),
    close(): Promise<void> {
      dependencies.generationJobs.close();

      return Promise.resolve();
    },
  };
}
