import {
  CharacterDetailResponseSchema,
  CharacterIdSchema,
  ImportCharacterCardCommandSchema,
  SaveCharacterCommandSchema,
} from '@immersion/contracts/characters';
import { ApiProblemSchema } from '@immersion/contracts/common';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';

import { deleteCharacter } from '../../application/delete-character.js';
import { InvalidCharacterCardError } from '../../application/extract-png-character-card.js';
import { getCharacter } from '../../application/get-character.js';
import { CharacterNotFoundError, getCharacterAvatar } from '../../application/get-character-avatar.js';
import { importCharacterCard } from '../../application/import-character-card.js';
import { listCharacters } from '../../application/list-characters.js';
import { CharacterNotEditableError, createCharacter, updateCharacter } from '../../application/save-character.js';

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

  if (error instanceof CharacterNotEditableError) {
    return {
      statusCode: 409,
      body: ApiProblemSchema.parse({
        code: 'character_not_editable',
        message: 'This character is stored in a non-editable format (PNG card).',
      }),
    };
  }

  if (error instanceof InvalidCharacterCardError) {
    return {
      statusCode: 400,
      body: ApiProblemSchema.parse({
        code: 'invalid_character_card',
        message: error.message,
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

  app.post('/', async (request, reply) => {
    try {
      const command = SaveCharacterCommandSchema.parse(request.body);
      const character = await createCharacter(command);
      return reply.status(201).send(CharacterDetailResponseSchema.parse({ character }));
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create character');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.post('/import', async (request, reply) => {
    try {
      const command = ImportCharacterCardCommandSchema.parse(request.body);
      const character = await importCharacterCard(command);
      return reply.status(201).send(CharacterDetailResponseSchema.parse({ character }));
    } catch (error) {
      request.log.error({ err: error }, 'Failed to import character card');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.get('/:characterId', async (request, reply) => {
    try {
      const { characterId } = CharacterRouteParamsSchema.parse(request.params);
      const character = await getCharacter(characterId);
      return CharacterDetailResponseSchema.parse({ character });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load character');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.put('/:characterId', async (request, reply) => {
    try {
      const { characterId } = CharacterRouteParamsSchema.parse(request.params);
      const command = SaveCharacterCommandSchema.parse(request.body);
      const character = await updateCharacter(characterId, command);
      return CharacterDetailResponseSchema.parse({ character });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update character');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.delete('/:characterId', async (request, reply) => {
    try {
      const { characterId } = CharacterRouteParamsSchema.parse(request.params);
      await deleteCharacter(characterId);
      return reply.status(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete character');
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
