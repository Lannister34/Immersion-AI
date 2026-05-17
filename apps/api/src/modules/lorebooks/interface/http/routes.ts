import { ApiProblemSchema } from '@immersion/contracts/common';
import {
  LorebookDetailResponseSchema,
  LorebookIdSchema,
  SaveLorebookCommandSchema,
} from '@immersion/contracts/lorebooks';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';

import { deleteLorebook } from '../../application/delete-lorebook.js';
import { getLorebook, LorebookNotFoundError } from '../../application/get-lorebook.js';
import { listLorebooks } from '../../application/list-lorebooks.js';
import { createLorebook, updateLorebook } from '../../application/save-lorebook.js';

const LorebookRouteParamsSchema = z.object({
  lorebookId: LorebookIdSchema,
});

function toProblem(error: unknown) {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: ApiProblemSchema.parse({
        code: 'validation_error',
        message: error.issues[0]?.message ?? 'Invalid request payload.',
      }),
    };
  }

  if (error instanceof LorebookNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'lorebook_not_found',
        message: 'Lorebook not found.',
      }),
    };
  }

  return {
    statusCode: 500,
    body: ApiProblemSchema.parse({
      code: 'internal_error',
      message: 'Unexpected error.',
    }),
  };
}

export const lorebooksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    try {
      return await listLorebooks();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list lorebooks');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.post('/', async (request, reply) => {
    try {
      const command = SaveLorebookCommandSchema.parse(request.body);
      const lorebook = await createLorebook(command);
      return reply.status(201).send(LorebookDetailResponseSchema.parse({ lorebook }));
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create lorebook');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.get('/:lorebookId', async (request, reply) => {
    try {
      const { lorebookId } = LorebookRouteParamsSchema.parse(request.params);
      const lorebook = await getLorebook(lorebookId);
      return LorebookDetailResponseSchema.parse({ lorebook });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load lorebook');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.delete('/:lorebookId', async (request, reply) => {
    try {
      const { lorebookId } = LorebookRouteParamsSchema.parse(request.params);
      await deleteLorebook(lorebookId);
      return reply.status(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete lorebook');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });
};
