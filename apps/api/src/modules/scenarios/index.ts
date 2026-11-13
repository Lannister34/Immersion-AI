export const scenariosModuleId = 'scenarios' as const;

export { ScenarioNotFoundError } from './application/get-scenario.js';
export type { ScenarioStore } from './application/scenario-store.js';
export { createFileScenarioStore } from './infrastructure/file-scenario-store.js';
export { scenariosProblems } from './interface/http/scenarios-problems.js';
export { createScenariosModule, type ScenariosModule, type ScenariosModuleDependencies } from './scenarios-module.js';
