import type { FastifyPluginAsync } from 'fastify';

import type { DraftGenerationDependencies } from './application/generation-ports.js';
import { createGenerationRoutes } from './interface/http/routes.js';

export type GenerationModuleDependencies = DraftGenerationDependencies;

export interface GenerationModule {
  readonly routes: FastifyPluginAsync;
}

export function createGenerationModule(dependencies: GenerationModuleDependencies): GenerationModule {
  return {
    routes: createGenerationRoutes(dependencies),
  };
}
