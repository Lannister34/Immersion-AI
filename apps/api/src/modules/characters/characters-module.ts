import type { CharacterDetailDto } from '@immersion/contracts/characters';
import type { FastifyPluginAsync } from 'fastify';

import { getCharacter } from './application/get-character.js';
import { type CharactersRoutesDependencies, createCharactersRoutes } from './interface/http/routes.js';

export type CharactersModuleDependencies = CharactersRoutesDependencies;

export interface CharactersModule {
  readonly routes: FastifyPluginAsync;
  findCharacter(characterId: string): Promise<CharacterDetailDto | null>;
  getCharacter(characterId: string): Promise<CharacterDetailDto>;
}

export function createCharactersModule(dependencies: CharactersModuleDependencies): CharactersModule {
  return {
    routes: createCharactersRoutes(dependencies),
    findCharacter: (characterId) => dependencies.characterStore.readCharacterDetail(characterId),
    getCharacter: (characterId) => getCharacter(characterId, dependencies),
  };
}
