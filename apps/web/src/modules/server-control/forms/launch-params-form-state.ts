import type { LaunchFlags } from '../view-models/launch-flags';

export interface LaunchParamsFormState {
  flashAttention: boolean;
  gpuLayers: string;
  threads: string;
}

export type LaunchParamsParseResult = { config: LaunchFlags } | { error: string };

export function toLaunchParamsForm(config: LaunchFlags): LaunchParamsFormState {
  return {
    flashAttention: config.flashAttention,
    gpuLayers: String(config.gpuLayers),
    threads: String(config.threads),
  };
}

export function launchParamsFormsEqual(left: LaunchParamsFormState, right: LaunchParamsFormState): boolean {
  return (
    left.flashAttention === right.flashAttention && left.gpuLayers === right.gpuLayers && left.threads === right.threads
  );
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim();

  return /^-?\d+$/u.test(trimmed) ? Number(trimmed) : null;
}

export function parseLaunchParamsForm(form: LaunchParamsFormState): LaunchParamsParseResult {
  const gpuLayers = parseInteger(form.gpuLayers);
  if (gpuLayers === null) {
    return { error: 'Число GPU-слоёв — целое число.' };
  }

  const threads = parseInteger(form.threads);
  if (threads === null || threads < 0) {
    return { error: 'Число потоков — целое число не меньше нуля (0 — автоматически).' };
  }

  return { config: { flashAttention: form.flashAttention, gpuLayers, threads } };
}
