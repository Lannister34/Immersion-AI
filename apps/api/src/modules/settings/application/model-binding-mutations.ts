import type { ModelBindingMutationResponse } from '@immersion/contracts/settings';

import { updateLegacyUserSettingsSource } from '../../../shared/infrastructure/legacy-settings-source.js';
import { getSettingsOverview } from './get-settings-overview.js';
import { SamplerPresetNotFoundError } from './sampler-preset-mutations.js';

export class ModelBindingNotFoundError extends Error {
  constructor(modelName: string) {
    super(`Model binding not found: ${modelName}`);
    this.name = 'ModelBindingNotFoundError';
  }
}

function readBindingMap(source: Record<string, unknown>): Record<string, string> {
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

function readPresetIds(source: Record<string, unknown>): Set<string> {
  const raw = Array.isArray(source.samplerPresets) ? source.samplerPresets : [];
  const ids = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as { id?: unknown };
    if (typeof candidate.id === 'string' && candidate.id.length > 0) {
      ids.add(candidate.id);
    }
  }
  return ids;
}

export async function upsertModelBinding(modelName: string, presetId: string): Promise<ModelBindingMutationResponse> {
  const trimmedModelName = modelName.trim();
  if (trimmedModelName.length === 0) {
    throw new ModelBindingNotFoundError(modelName);
  }

  await updateLegacyUserSettingsSource((source) => {
    const presetIds = readPresetIds(source);
    if (!presetIds.has(presetId)) {
      throw new SamplerPresetNotFoundError(presetId);
    }

    return {
      ...source,
      modelPresetMap: { ...readBindingMap(source), [trimmedModelName]: presetId },
    };
  });

  return { sampler: getSettingsOverview().sampler };
}

export async function deleteModelBinding(modelName: string): Promise<ModelBindingMutationResponse> {
  await updateLegacyUserSettingsSource((source) => {
    const existing = readBindingMap(source);
    if (!(modelName in existing)) {
      throw new ModelBindingNotFoundError(modelName);
    }
    const { [modelName]: _removed, ...nextMap } = existing;

    return {
      ...source,
      modelPresetMap: nextMap,
    };
  });

  return { sampler: getSettingsOverview().sampler };
}
