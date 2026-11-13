import {
  CharacterDetailResponseSchema,
  ImportCharacterCardCommandSchema,
  SaveCharacterCommandSchema,
  UploadCharacterAvatarCommandSchema,
} from '@immersion/contracts/characters';
import type { FastifyPluginAsync } from 'fastify';

import type { Clock } from '../../../../platform/clock/clock.js';
import { parseRequest } from '../../../../platform/http/parse-request.js';
import type { CharacterStore } from '../../application/character-store.js';
import { deleteCharacter } from '../../application/delete-character.js';
import { deleteCharacterAvatar } from '../../application/delete-character-avatar.js';
import { getCharacter } from '../../application/get-character.js';
import { getCharacterAvatar } from '../../application/get-character-avatar.js';
import { importCharacterCard } from '../../application/import-character-card.js';
import { type CharacterChatStatsPort, listCharacters } from '../../application/list-characters.js';
import { createCharacter, updateCharacter } from '../../application/save-character.js';
import { uploadCharacterAvatar } from '../../application/upload-character-avatar.js';
import { CharacterRouteParamsSchema } from './request-schemas.js';

export interface CharactersRoutesDependencies {
  readonly characterStore: CharacterStore;
  readonly chatStats: CharacterChatStatsPort;
  readonly clock: Clock;
}

export function createCharactersRoutes(dependencies: CharactersRoutesDependencies): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async () => listCharacters(dependencies));

    app.post('/', async (request, reply) => {
      const command = parseRequest(SaveCharacterCommandSchema, request.body);
      const character = await createCharacter(command, dependencies);

      return reply.status(201).send(CharacterDetailResponseSchema.parse({ character }));
    });

    app.post('/import', async (request, reply) => {
      const command = parseRequest(ImportCharacterCardCommandSchema, request.body);
      const character = await importCharacterCard(command, dependencies);

      return reply.status(201).send(CharacterDetailResponseSchema.parse({ character }));
    });

    app.get('/:characterId', async (request) => {
      const { characterId } = parseRequest(CharacterRouteParamsSchema, request.params);
      const character = await getCharacter(characterId, dependencies);

      return CharacterDetailResponseSchema.parse({ character });
    });

    app.put('/:characterId', async (request) => {
      const { characterId } = parseRequest(CharacterRouteParamsSchema, request.params);
      const command = parseRequest(SaveCharacterCommandSchema, request.body);
      const character = await updateCharacter(characterId, command, dependencies);

      return CharacterDetailResponseSchema.parse({ character });
    });

    app.delete('/:characterId', async (request, reply) => {
      const { characterId } = parseRequest(CharacterRouteParamsSchema, request.params);
      await deleteCharacter(characterId, dependencies);

      return reply.status(204).send();
    });

    app.put('/:characterId/avatar', async (request) => {
      const { characterId } = parseRequest(CharacterRouteParamsSchema, request.params);
      const command = parseRequest(UploadCharacterAvatarCommandSchema, request.body);
      const character = await uploadCharacterAvatar(characterId, command, dependencies);

      return CharacterDetailResponseSchema.parse({ character });
    });

    app.delete('/:characterId/avatar', async (request, reply) => {
      const { characterId } = parseRequest(CharacterRouteParamsSchema, request.params);
      await deleteCharacterAvatar(characterId, dependencies);

      return reply.status(204).send();
    });

    app.get('/:characterId/avatar', async (request, reply) => {
      const { characterId } = parseRequest(CharacterRouteParamsSchema, request.params);
      const payload = await getCharacterAvatar(characterId, dependencies);

      reply.header('Content-Type', payload.contentType);
      reply.header('Cache-Control', 'private, max-age=300');

      return reply.send(payload.body);
    });
  };
}
