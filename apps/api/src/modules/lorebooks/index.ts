export const lorebooksModuleId = 'lorebooks' as const;

export type { LorebookStore } from './application/lorebook-store.js';
export { createFileLorebookStore } from './infrastructure/file-lorebook-store.js';
export { lorebooksProblems } from './interface/http/lorebooks-problems.js';
export { createLorebooksModule, type LorebooksModule, type LorebooksModuleDependencies } from './lorebooks-module.js';
