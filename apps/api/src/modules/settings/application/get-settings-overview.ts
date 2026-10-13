import { type SettingsOverviewResponse, SettingsOverviewResponseSchema } from '@immersion/contracts/settings';

import { readLegacyUserSettingsSource } from '../../../shared/infrastructure/legacy-settings-source.js';
import { DEFAULT_USER_NAME } from './get-profile-user-name.js';

const DEFAULT_SAMPLER_PRESET = {
  contextTrimStrategy: 'trim_middle',
  id: 'default',
  maxContextLength: 8192,
  maxTokens: 600,
  minP: 0.02,
  name: 'Default',
  presencePenalty: 0,
  repeatPenalty: 1.05,
  repeatPenaltyRange: 2048,
  temperature: 1,
  topK: 0,
  topP: 1,
} satisfies SettingsOverviewResponse['sampler']['presets'][number];

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function getMessageFormatting(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    actionsItalic: getBoolean(source.actionsItalic, true),
    quotesHighlighted: getBoolean(source.quotesHighlighted, false),
  };
}

function getResponseLanguage(value: unknown) {
  return value === 'en' || value === 'none' ? value : 'ru';
}

function getFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getNonNegativeInteger(value: unknown, fallback: number) {
  const parsed = getFiniteNumber(value, fallback);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function getPositiveInteger(value: unknown, fallback: number) {
  const parsed = getFiniteNumber(value, fallback);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getNonNegativeNumber(value: unknown, fallback: number) {
  const parsed = getFiniteNumber(value, fallback);

  return parsed >= 0 ? parsed : fallback;
}

function getContextTrimStrategy(
  value: unknown,
): SettingsOverviewResponse['sampler']['presets'][number]['contextTrimStrategy'] {
  return value === 'trim_start' ? 'trim_start' : 'trim_middle';
}

function getModelBindings(
  value: unknown,
  presets: SettingsOverviewResponse['sampler']['presets'],
): SettingsOverviewResponse['sampler']['modelBindings'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  const presetIds = new Set(presets.map((preset) => preset.id));

  return Object.entries(value).flatMap(([rawModelName, rawPresetId]) => {
    const modelName = rawModelName.trim();
    const presetId = getString(rawPresetId).trim();

    if (!modelName || !presetId || !presetIds.has(presetId)) {
      return [];
    }

    return [
      {
        modelName,
        presetId,
      },
    ];
  });
}

export function getSettingsOverview(): SettingsOverviewResponse {
  const source = readLegacyUserSettingsSource();

  const samplerPresets = Array.isArray(source.samplerPresets) ? source.samplerPresets : [];
  const presets = samplerPresets.flatMap((preset) => {
    if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
      return [];
    }

    const candidate = preset as Record<string, unknown>;
    const id = getString(candidate.id);
    const name = getString(candidate.name);

    if (!id || !name) {
      return [];
    }

    return [
      {
        contextTrimStrategy: getContextTrimStrategy(candidate.context_trim_strategy),
        id,
        maxContextLength: getNonNegativeInteger(candidate.max_context_length, DEFAULT_SAMPLER_PRESET.maxContextLength),
        maxTokens: getPositiveInteger(candidate.max_length, DEFAULT_SAMPLER_PRESET.maxTokens),
        minP: getNonNegativeNumber(candidate.min_p, DEFAULT_SAMPLER_PRESET.minP),
        name,
        presencePenalty: getFiniteNumber(candidate.presence_penalty, DEFAULT_SAMPLER_PRESET.presencePenalty),
        repeatPenalty: getNonNegativeNumber(candidate.rep_pen, DEFAULT_SAMPLER_PRESET.repeatPenalty),
        repeatPenaltyRange: getNonNegativeInteger(candidate.rep_pen_range, DEFAULT_SAMPLER_PRESET.repeatPenaltyRange),
        temperature: getNonNegativeNumber(candidate.temperature, DEFAULT_SAMPLER_PRESET.temperature),
        topK: getNonNegativeInteger(candidate.top_k, DEFAULT_SAMPLER_PRESET.topK),
        topP: getNonNegativeNumber(candidate.top_p, DEFAULT_SAMPLER_PRESET.topP),
      },
    ];
  });
  const normalizedPresets = presets.length > 0 ? presets : [DEFAULT_SAMPLER_PRESET];

  const modelBindings = getModelBindings(source.modelPresetMap, normalizedPresets);
  const requestedActivePresetId = getString(source.activePresetId);
  const activePresetId = normalizedPresets.some((preset) => preset.id === requestedActivePresetId)
    ? requestedActivePresetId
    : normalizedPresets[0]!.id;

  return SettingsOverviewResponseSchema.parse({
    profile: {
      userName: getString(source.userName, DEFAULT_USER_NAME),
      userPersona: getString(source.userPersona),
      systemPromptTemplate: getString(source.systemPromptTemplate),
      responseLanguage: getResponseLanguage(source.responseLanguage),
      streamingEnabled: getBoolean(source.streamingEnabled, true),
      thinkingEnabled: getBoolean(source.thinkingEnabled, true),
      messageFormatting: getMessageFormatting(source.messageFormatting),
    },
    sampler: {
      activePresetId,
      modelBindings,
      presets: normalizedPresets,
      modelBindingCount: modelBindings.length,
    },
  });
}
