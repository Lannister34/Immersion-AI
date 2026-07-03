import {
  LorebookDetailResponseSchema,
  LorebookIdSchema,
  SaveLorebookCommandSchema,
} from '@immersion/contracts/lorebooks';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createToProblem, problem } from '../../../../shared/interface/http/problem.js';
import { deleteLorebook } from '../../application/delete-lorebook.js';
import { getLorebook, LorebookNotFoundError } from '../../application/get-lorebook.js';
import { listLorebooks } from '../../application/list-lorebooks.js';
import { createLorebook, updateLorebook } from '../../application/save-lorebook.js';

const LorebookRouteParamsSchema = z.object({
  lorebookId: LorebookIdSchema,
});

const toProblem = createToProblem((error) => {
  if (error instanceof LorebookNotFoundError) {
    return problem(404, 'lorebook_not_found', 'Lorebook not found.');
  }

  return null;
});

export const lorebooksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    try {
      return await listLorebooks();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list lorebooks');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/', async (request, reply) => {
    try {
      const command = SaveLorebookCommandSchema.parse(request.body);
      const lorebook = await createLorebook(command);
      return reply.status(201).send(LorebookDetailResponseSchema.parse({ lorebook }));
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create lorebook');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/:lorebookId', async (request, reply) => {
    try {
      const { lorebookId } = LorebookRouteParamsSchema.parse(request.params);
      const lorebook = await getLorebook(lorebookId);
      return LorebookDetailResponseSchema.parse({ lorebook });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load lorebook');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.put('/:lorebookId', async (request, reply) => {
    try {
      const { lorebookId } = LorebookRouteParamsSchema.parse(request.params);
      const command = SaveLorebookCommandSchema.parse(request.body);
      const lorebook = await updateLorebook(lorebookId, command);
      return LorebookDetailResponseSchema.parse({ lorebook });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update lorebook');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.delete('/:lorebookId', async (request, reply) => {
    try {
      const { lorebookId } = LorebookRouteParamsSchema.parse(request.params);
      await deleteLorebook(lorebookId);
      return reply.status(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete lorebook');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
};
