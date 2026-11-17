export const runtimeModuleId = 'runtime' as const;

export {
  getRunningRuntimeEndpoint,
  type RunningRuntimeEndpoint,
} from './application/get-running-runtime-endpoint.js';
export type { ModelScanner } from './application/model-scanner.js';
export { RuntimeConfigRepository } from './application/runtime-config-repository.js';
export { RuntimeBinaryMissingError } from './application/runtime-errors.js';
export type { RuntimeProcess, RuntimeStartConfig } from './application/runtime-process.js';
export { LlmProcessManager } from './infrastructure/llm-process-manager.js';
export { ModelDirectoryScanner } from './infrastructure/model-directory-scanner.js';
export { runtimeProblems } from './interface/http/runtime-problems.js';
export { createRuntimeModule, type RuntimeModule, type RuntimeModuleDependencies } from './runtime-module.js';
