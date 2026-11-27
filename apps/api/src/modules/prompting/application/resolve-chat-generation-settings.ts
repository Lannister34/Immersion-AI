import type { ChatGenerationSettingsDto, ChatSamplingOverridesDto } from '@immersion/contracts/chats';
import type { ReplyTokenLimit } from '@immersion/contracts/common';
import type {
  ContextTrimStrategy,
  SamplerPresetSummary,
  SettingsOverviewResponse,
} from '@immersion/contracts/settings';

import { resolveActiveSamplerPreset } from '../../settings/index.js';

export type SamplerPresetResolutionSource = 'active_preset' | 'chat_preset' | 'model_binding';

export interface AppliedChatSamplingOverrides {
  contextTrimStrategy: boolean;
  maxContextLength: boolean;
  maxTokens: boolean;
  minP: boolean;
  presencePenalty: boolean;
  repeatPenalty: boolean;
  repeatPenaltyRange: boolean;
  temperature: boolean;
  topK: boolean;
  topP: boolean;
}

export interface ResolvedChatGenerationSamplingSettings {
  contextTrimStrategy: ContextTrimStrategy;
  maxContextLength: number;
  maxTokens: ReplyTokenLimit;
  minP: number;
  presencePenalty: number;
  repeatPenalty: number;
  repeatPenaltyRange: number;
  temperature: number;
  topK: number;
  topP: number;
}

export interface ResolvedChatGenerationSettings {
  appliedChatOverrides: AppliedChatSamplingOverrides;
  ignoredChatSamplerPresetId: string | null;
  modelBindingPresetId: string | null;
  modelName: string | null;
  samplerPreset: SamplerPresetSummary;
  samplerPresetSource: SamplerPresetResolutionSource;
  sampling: ResolvedChatGenerationSamplingSettings;
}

export class InvalidChatGenerationSettingsResolutionError extends Error {
  constructor(readonly samplerPresetId: string) {
    super(`Chat sampler preset not found: ${samplerPresetId}`);
    this.name = 'InvalidChatGenerationSettingsResolutionError';
  }
}

interface SamplerPresetResolution {
  ignoredChatSamplerPresetId: string | null;
  modelBindingPresetId: string | null;
  preset: SamplerPresetSummary;
  source: SamplerPresetResolutionSource;
}

function hasOverride<Key extends keyof ChatSamplingOverridesDto>(
  overrides: ChatSamplingOverridesDto,
  key: Key,
): boolean {
  return overrides[key] !== null;
}

function findPresetById(settings: SettingsOverviewResponse, presetId: string | null) {
  if (!presetId) {
    return null;
  }

  return settings.sampler.presets.find((preset) => preset.id === presetId) ?? null;
}

function resolveModelBinding(settings: SettingsOverviewResponse, modelName: string | null) {
  const normalizedModelName = modelName?.trim();

  if (!normalizedModelName) {
    return null;
  }

  return settings.sampler.modelBindings.find((binding) => binding.modelName === normalizedModelName) ?? null;
}

function resolveSamplerPreset(
  settings: SettingsOverviewResponse,
  modelName: string | null,
  chatGenerationSettings: ChatGenerationSettingsDto,
): SamplerPresetResolution {
  const chatPreset = findPresetById(settings, chatGenerationSettings.samplerPresetId);

  if (chatPreset) {
    return {
      ignoredChatSamplerPresetId: null,
      modelBindingPresetId: null,
      preset: chatPreset,
      source: 'chat_preset',
    };
  }

  if (chatGenerationSettings.samplerPresetId) {
    throw new InvalidChatGenerationSettingsResolutionError(chatGenerationSettings.samplerPresetId);
  }

  const modelBinding = resolveModelBinding(settings, modelName);
  const modelBoundPreset = modelBinding ? findPresetById(settings, modelBinding.presetId) : null;

  if (modelBinding && modelBoundPreset) {
    return {
      ignoredChatSamplerPresetId: chatGenerationSettings.samplerPresetId,
      modelBindingPresetId: modelBinding.presetId,
      preset: modelBoundPreset,
      source: 'model_binding',
    };
  }

  return {
    ignoredChatSamplerPresetId: chatGenerationSettings.samplerPresetId,
    modelBindingPresetId: modelBinding?.presetId ?? null,
    preset: resolveActiveSamplerPreset(settings),
    source: 'active_preset',
  };
}

export function resolveChatGenerationSettings(
  settings: SettingsOverviewResponse,
  modelName: string | null,
  chatGenerationSettings: ChatGenerationSettingsDto,
): ResolvedChatGenerationSettings {
  const presetResolution = resolveSamplerPreset(settings, modelName, chatGenerationSettings);
  const overrides = chatGenerationSettings.sampling;

  return {
    appliedChatOverrides: {
      contextTrimStrategy: hasOverride(overrides, 'contextTrimStrategy'),
      maxContextLength: hasOverride(overrides, 'maxContextLength'),
      maxTokens: hasOverride(overrides, 'maxTokens'),
      minP: hasOverride(overrides, 'minP'),
      presencePenalty: hasOverride(overrides, 'presencePenalty'),
      repeatPenalty: hasOverride(overrides, 'repeatPenalty'),
      repeatPenaltyRange: hasOverride(overrides, 'repeatPenaltyRange'),
      temperature: hasOverride(overrides, 'temperature'),
      topK: hasOverride(overrides, 'topK'),
      topP: hasOverride(overrides, 'topP'),
    },
    ignoredChatSamplerPresetId: presetResolution.ignoredChatSamplerPresetId,
    modelBindingPresetId: presetResolution.modelBindingPresetId,
    modelName: modelName?.trim() || null,
    samplerPreset: presetResolution.preset,
    samplerPresetSource: presetResolution.source,
    sampling: {
      contextTrimStrategy: overrides.contextTrimStrategy ?? presetResolution.preset.contextTrimStrategy,
      maxContextLength: overrides.maxContextLength ?? presetResolution.preset.maxContextLength,
      maxTokens: overrides.maxTokens ?? presetResolution.preset.maxTokens,
      minP: overrides.minP ?? presetResolution.preset.minP,
      presencePenalty: overrides.presencePenalty ?? presetResolution.preset.presencePenalty,
      repeatPenalty: overrides.repeatPenalty ?? presetResolution.preset.repeatPenalty,
      repeatPenaltyRange: overrides.repeatPenaltyRange ?? presetResolution.preset.repeatPenaltyRange,
      temperature: overrides.temperature ?? presetResolution.preset.temperature,
      topK: overrides.topK ?? presetResolution.preset.topK,
      topP: overrides.topP ?? presetResolution.preset.topP,
    },
  };
}
