import type { LorebookDetailDto } from '@immersion/contracts/lorebooks';
import type { FastifyPluginAsync } from 'fastify';

import { createLorebooksRoutes, type LorebooksRoutesDependencies } from './interface/http/routes.js';

export type LorebooksModuleDependencies = LorebooksRoutesDependencies;

export interface LorebooksModule {
  readonly routes: FastifyPluginAsync;
  findLorebook(lorebookId: string): Promise<LorebookDetailDto | null>;
}

export function createLorebooksModule(dependencies: LorebooksModuleDependencies): LorebooksModule {
  return {
    routes: createLorebooksRoutes(dependencies),
    findLorebook: (lorebookId) => dependencies.lorebookStore.readLorebookDetail(lorebookId),
  };
}
