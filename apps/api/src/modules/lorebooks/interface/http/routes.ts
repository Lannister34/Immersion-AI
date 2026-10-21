import { LorebookDetailResponseSchema, SaveLorebookCommandSchema } from '@immersion/contracts/lorebooks';
import type { FastifyPluginAsync } from 'fastify';

import { parseRequest } from '../../../../platform/http/parse-request.js';
import { deleteLorebook } from '../../application/delete-lorebook.js';
import { getLorebook } from '../../application/get-lorebook.js';
import { listLorebooks } from '../../application/list-lorebooks.js';
import { createLorebook, updateLorebook } from '../../application/save-lorebook.js';
import { LorebookRouteParamsSchema } from './request-schemas.js';

export const lorebooksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => listLorebooks());

  app.post('/', async (request, reply) => {
    const command = parseRequest(SaveLorebookCommandSchema, request.body);
    const lorebook = await createLorebook(command);

    return reply.status(201).send(LorebookDetailResponseSchema.parse({ lorebook }));
  });

  app.get('/:lorebookId', async (request) => {
    const { lorebookId } = parseRequest(LorebookRouteParamsSchema, request.params);
    const lorebook = await getLorebook(lorebookId);

    return LorebookDetailResponseSchema.parse({ lorebook });
  });

  app.put('/:lorebookId', async (request) => {
    const { lorebookId } = parseRequest(LorebookRouteParamsSchema, request.params);
    const command = parseRequest(SaveLorebookCommandSchema, request.body);
    const lorebook = await updateLorebook(lorebookId, command);

    return LorebookDetailResponseSchema.parse({ lorebook });
  });

  app.delete('/:lorebookId', async (request, reply) => {
    const { lorebookId } = parseRequest(LorebookRouteParamsSchema, request.params);
    await deleteLorebook(lorebookId);

    return reply.status(204).send();
  });
};
