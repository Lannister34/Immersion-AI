import { type RuntimeConfigSnapshot, RuntimeConfigSnapshotSchema } from '@immersion/contracts/runtime';

export interface RuntimeConfigDefaults {
  readonly modelsDir: string;
  readonly port: number;
}

export function normalizeRuntimeConfig(raw: unknown, defaults: RuntimeConfigDefaults): RuntimeConfigSnapshot {
  const configSource = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const modelsDirs = Array.isArray(configSource.modelsDirs)
    ? configSource.modelsDirs
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [defaults.modelsDir];

  return RuntimeConfigSnapshotSchema.parse({
    modelsDirs,
    port: typeof configSource.port === 'number' ? configSource.port : defaults.port,
    gpuLayers: typeof configSource.gpuLayers === 'number' ? configSource.gpuLayers : 0,
    contextSize: typeof configSource.contextSize === 'number' ? configSource.contextSize : 8192,
    flashAttention: typeof configSource.flashAttention === 'boolean' ? configSource.flashAttention : false,
    threads: typeof configSource.threads === 'number' ? configSource.threads : 0,
  });
}
