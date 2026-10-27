import type { RuntimeLaunchConfig } from '@immersion/contracts/runtime';

export interface LaunchParamsFormState {
  contextSize: string;
  flashAttention: boolean;
  gpuLayers: string;
  threads: string;
}

export type LaunchParamsParseResult = { config: RuntimeLaunchConfig } | { error: string };

export function toLaunchParamsForm(config: RuntimeLaunchConfig): LaunchParamsFormState {
  return {
    contextSize: String(config.contextSize),
    flashAttention: config.flashAttention,
    gpuLayers: String(config.gpuLayers),
    threads: String(config.threads),
  };
}

export function launchParamsFormsEqual(left: LaunchParamsFormState, right: LaunchParamsFormState): boolean {
  return (
    left.contextSize === right.contextSize &&
    left.flashAttention === right.flashAttention &&
    left.gpuLayers === right.gpuLayers &&
    left.threads === right.threads
  );
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim();

  return /^-?\d+$/u.test(trimmed) ? Number(trimmed) : null;
}

export function parseLaunchParamsForm(form: LaunchParamsFormState): LaunchParamsParseResult {
  const contextSize = parseInteger(form.contextSize);
  if (contextSize === null || contextSize < 1) {
    return { error: 'Размер контекста — целое число токенов больше нуля.' };
  }

  const gpuLayers = parseInteger(form.gpuLayers);
  if (gpuLayers === null) {
    return { error: 'Число GPU-слоёв — целое число.' };
  }

  const threads = parseInteger(form.threads);
  if (threads === null || threads < 0) {
    return { error: 'Число потоков — целое число не меньше нуля (0 — автоматически).' };
  }

  return { config: { contextSize, flashAttention: form.flashAttention, gpuLayers, threads } };
}
