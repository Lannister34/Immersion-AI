export const charactersModuleId = 'characters' as const;

export type { CharacterStore } from './application/character-store.js';
export { CharacterNotFoundError } from './application/get-character-avatar.js';
export {
  type CharactersModule,
  type CharactersModuleDependencies,
  createCharactersModule,
} from './characters-module.js';
export { createFileCharacterStore } from './infrastructure/file-character-store.js';
export { charactersProblems } from './interface/http/characters-problems.js';
