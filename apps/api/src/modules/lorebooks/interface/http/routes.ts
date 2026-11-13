import { LorebookDetailResponseSchema, SaveLorebookCommandSchema } from '@immersion/contracts/lorebooks';
import type { FastifyPluginAsync } from 'fastify';

import type { Clock } from '../../../../platform/clock/clock.js';
import { parseRequest } from '../../../../platform/http/parse-request.js';
import { deleteLorebook } from '../../application/delete-lorebook.js';
import { getLorebook } from '../../application/get-lorebook.js';
import { listLorebooks } from '../../application/list-lorebooks.js';
import type { LorebookStore } from '../../application/lorebook-store.js';
import { createLorebook, updateLorebook } from '../../application/save-lorebook.js';
import { LorebookRouteParamsSchema } from './request-schemas.js';

export interface LorebooksRoutesDependencies {
  readonly clock: Clock;
  readonly lorebookStore: LorebookStore;
}

export function createLorebooksRoutes(dependencies: LorebooksRoutesDependencies): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async () => listLorebooks(dependencies));

    app.post('/', async (request, reply) => {
      const command = parseRequest(SaveLorebookCommandSchema, request.body);
      const lorebook = await createLorebook(command, dependencies);

      return reply.status(201).send(LorebookDetailResponseSchema.parse({ lorebook }));
    });

    app.get('/:lorebookId', async (request) => {
      const { lorebookId } = parseRequest(LorebookRouteParamsSchema, request.params);
      const lorebook = await getLorebook(lorebookId, dependencies);

      return LorebookDetailResponseSchema.parse({ lorebook });
    });

    app.put('/:lorebookId', async (request) => {
      const { lorebookId } = parseRequest(LorebookRouteParamsSchema, request.params);
      const command = parseRequest(SaveLorebookCommandSchema, request.body);
      const lorebook = await updateLorebook(lorebookId, command, dependencies);

      return LorebookDetailResponseSchema.parse({ lorebook });
    });

    app.delete('/:lorebookId', async (request, reply) => {
      const { lorebookId } = parseRequest(LorebookRouteParamsSchema, request.params);
      await deleteLorebook(lorebookId, dependencies);

      return reply.status(204).send();
    });
  };
}
