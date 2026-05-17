import { CharacterIdSchema } from '@immersion/contracts/characters';
import { ApiProblemSchema } from '@immersion/contracts/common';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';

import { CharacterNotFoundError, getCharacterAvatar } from '../../application/get-character-avatar.js';
import { listCharacters } from '../../application/list-characters.js';

const CharacterRouteParamsSchema = z.object({
  characterId: CharacterIdSchema,
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

  if (error instanceof CharacterNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'character_not_found',
        message: 'Character not found.',
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

export const charactersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    try {
      return await listCharacters();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list characters');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.get('/:characterId/avatar', async (request, reply) => {
    try {
      const { characterId } = CharacterRouteParamsSchema.parse(request.params);
      const payload = await getCharacterAvatar(characterId);

      reply.header('Content-Type', payload.contentType);
      reply.header('Cache-Control', 'private, max-age=300');

      return reply.send(payload.body);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load character avatar');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });
};
