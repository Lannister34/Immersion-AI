import type {
  CreateSamplerPresetCommand,
  DeleteSamplerPresetResponse,
  SamplerPresetMutationResponse,
  SetActiveSamplerPresetResponse,
  UpdateSamplerPresetCommand,
} from '@immersion/contracts/settings';

import { updateLegacyUserSettingsSource } from '../../../shared/infrastructure/legacy-settings-source.js';
import { getSettingsOverview } from './get-settings-overview.js';
import { encodeSamplerPreset, generateUniquePresetId, type StoredSamplerPreset } from './sampler-preset-encoding.js';

export class SamplerPresetNotFoundError extends Error {
  constructor(presetId: string) {
    super(`Sampler preset not found: ${presetId}`);
    this.name = 'SamplerPresetNotFoundError';
  }
}

export class LastSamplerPresetError extends Error {
  constructor() {
    super('Cannot delete the last sampler preset.');
    this.name = 'LastSamplerPresetError';
  }
}

function readStoredPresets(source: Record<string, unknown>): StoredSamplerPreset[] {
  const raw = Array.isArray(source.samplerPresets) ? source.samplerPresets : [];
  const presets: StoredSamplerPreset[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as StoredSamplerPreset & Record<string, unknown>;
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') continue;
    presets.push(candidate);
  }
  return presets;
}

function readStoredModelPresetMap(source: Record<string, unknown>): Record<string, string> {
  const raw = source.modelPresetMap;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key === 'string' && typeof value === 'string') {
      map[key] = value;
    }
  }
  return map;
}

function projectMutationResponse(presetId: string): SamplerPresetMutationResponse {
  const overview = getSettingsOverview();
  const preset = overview.sampler.presets.find((entry) => entry.id === presetId);
  if (!preset) {
    throw new SamplerPresetNotFoundError(presetId);
  }
  return {
    preset,
    sampler: overview.sampler,
  };
}

export async function createSamplerPreset(input: CreateSamplerPresetCommand): Promise<SamplerPresetMutationResponse> {
  let id = '';

  await updateLegacyUserSettingsSource((source) => {
    const existing = readStoredPresets(source);
    const existingIds = new Set(existing.map((preset) => preset.id));
    id = generateUniquePresetId(input.name, existingIds);
    const nextPreset = encodeSamplerPreset(id, input);

    return {
      ...source,
      samplerPresets: [...existing, nextPreset],
    };
  });

  return projectMutationResponse(id);
}

export async function updateSamplerPreset(
  presetId: string,
  input: UpdateSamplerPresetCommand,
): Promise<SamplerPresetMutationResponse> {
  await updateLegacyUserSettingsSource((source) => {
    const existing = readStoredPresets(source);
    const index = existing.findIndex((preset) => preset.id === presetId);
    if (index < 0) {
      throw new SamplerPresetNotFoundError(presetId);
    }
    const nextPresets = [...existing];
    nextPresets[index] = encodeSamplerPreset(presetId, input);

    return {
      ...source,
      samplerPresets: nextPresets,
    };
  });

  return projectMutationResponse(presetId);
}

export async function deleteSamplerPreset(presetId: string): Promise<DeleteSamplerPresetResponse> {
  await updateLegacyUserSettingsSource((source) => {
    const existing = readStoredPresets(source);
    const index = existing.findIndex((preset) => preset.id === presetId);
    if (index < 0) {
      throw new SamplerPresetNotFoundError(presetId);
    }
    if (existing.length <= 1) {
      throw new LastSamplerPresetError();
    }

    const nextPresets = existing.filter((preset) => preset.id !== presetId);
    const currentActiveId = typeof source.activePresetId === 'string' ? source.activePresetId : null;
    const nextActiveId = currentActiveId === presetId ? (nextPresets[0]?.id ?? null) : currentActiveId;
    const modelPresetMap = readStoredModelPresetMap(source);
    const nextModelPresetMap: Record<string, string> = {};
    for (const [modelName, mappedPresetId] of Object.entries(modelPresetMap)) {
      if (mappedPresetId !== presetId) {
        nextModelPresetMap[modelName] = mappedPresetId;
      }
    }

    const nextSource: Record<string, unknown> = {
      ...source,
      samplerPresets: nextPresets,
      modelPresetMap: nextModelPresetMap,
    };
    if (nextActiveId !== null) {
      nextSource.activePresetId = nextActiveId;
    }

    return nextSource;
  });

  return { sampler: getSettingsOverview().sampler };
}

export async function setActiveSamplerPreset(presetId: string): Promise<SetActiveSamplerPresetResponse> {
  await updateLegacyUserSettingsSource((source) => {
    const existing = readStoredPresets(source);
    if (!existing.some((preset) => preset.id === presetId)) {
      throw new SamplerPresetNotFoundError(presetId);
    }

    return {
      ...source,
      activePresetId: presetId,
    };
  });

  return { sampler: getSettingsOverview().sampler };
}
