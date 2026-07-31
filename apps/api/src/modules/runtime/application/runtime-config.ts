import { type RuntimeConfigCommand, RuntimeConfigCommandSchema } from '@immersion/contracts/runtime';

import { getLlmProcessManager } from '../infrastructure/llm-process-manager.js';

export function normalizeRuntimeConfig(raw: unknown): RuntimeConfigCommand {
  const configSource = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const manager = getLlmProcessManager();
  const engine = manager.getEngineInfo();
  const state = manager.getState();
  // Явный пустой список — валидное состояние «каталоги не заданы»;
  // дефолт подставляем только когда в настройках вообще нет массива.
  const modelsDirs = Array.isArray(configSource.modelsDirs)
    ? configSource.modelsDirs
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [engine.defaultModelsDir];

  return RuntimeConfigCommandSchema.parse({
    modelsDirs,
    port: typeof configSource.port === 'number' ? configSource.port : state.port,
    gpuLayers: typeof configSource.gpuLayers === 'number' ? configSource.gpuLayers : 0,
    contextSize: typeof configSource.contextSize === 'number' ? configSource.contextSize : 8192,
    flashAttention: typeof configSource.flashAttention === 'boolean' ? configSource.flashAttention : false,
    threads: typeof configSource.threads === 'number' ? configSource.threads : 0,
  });
}
