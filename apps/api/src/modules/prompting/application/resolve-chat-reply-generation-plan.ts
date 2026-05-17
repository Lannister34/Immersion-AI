import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { PromptCharacterSnapshot } from '@immersion/domain/prompting';

import { getSettingsOverview } from '../../settings/application/get-settings-overview.js';
import {
  buildChatReplyPromptBundle,
  type ChatReplyPromptBundle,
  type ChatReplyPromptMessage,
} from './build-chat-reply-prompt.js';
import {
  type ResolvedChatGenerationSamplingSettings,
  type ResolvedChatGenerationSettings,
  resolveChatGenerationSettings,
} from './resolve-chat-generation-settings.js';

export interface ChatReplyProviderSamplingSettings {
  minP: number;
  presencePenalty: number;
  repeatPenalty: number;
  repeatPenaltyRange: number;
  temperature: number;
  topK: number;
  topP: number;
}

export interface ChatReplyProviderRequestPlan {
  maxTokens: number;
  messages: ChatReplyPromptMessage[];
  sampling: ChatReplyProviderSamplingSettings;
}

export interface ChatReplyGenerationPlan {
  effectiveSettings: ResolvedChatGenerationSettings;
  prompt: ChatReplyPromptBundle;
  providerRequest: ChatReplyProviderRequestPlan;
}

export interface ResolveChatReplyGenerationPlanInput {
  character?: PromptCharacterSnapshot | null;
  characterScenarioContent?: string | null;
  providerModelName: string | null;
  session: ChatSessionDto;
  settings?: SettingsOverviewResponse;
}

function toPromptSamplerPreset(
  resolvedSettings: ResolvedChatGenerationSettings,
): ResolvedChatGenerationSettings['samplerPreset'] {
  return {
    ...resolvedSettings.samplerPreset,
    contextTrimStrategy: resolvedSettings.sampling.contextTrimStrategy,
    maxContextLength: resolvedSettings.sampling.maxContextLength,
    maxTokens: resolvedSettings.sampling.maxTokens,
  };
}

function toProviderSampling(sampling: ResolvedChatGenerationSamplingSettings): ChatReplyProviderSamplingSettings {
  return {
    minP: sampling.minP,
    presencePenalty: sampling.presencePenalty,
    repeatPenalty: sampling.repeatPenalty,
    repeatPenaltyRange: sampling.repeatPenaltyRange,
    temperature: sampling.temperature,
    topK: sampling.topK,
    topP: sampling.topP,
  };
}

export function resolveChatReplyGenerationPlan(input: ResolveChatReplyGenerationPlanInput): ChatReplyGenerationPlan {
  const settings = input.settings ?? getSettingsOverview();
  const effectiveSettings = resolveChatGenerationSettings(
    settings,
    input.providerModelName,
    input.session.generationSettings,
  );
  const prompt = buildChatReplyPromptBundle({
    character: input.character ?? null,
    characterScenarioContent: input.characterScenarioContent ?? null,
    samplerPreset: toPromptSamplerPreset(effectiveSettings),
    session: input.session,
    settings,
  });

  return {
    effectiveSettings,
    prompt,
    providerRequest: {
      maxTokens: effectiveSettings.sampling.maxTokens,
      messages: prompt.messages,
      sampling: toProviderSampling(effectiveSettings.sampling),
    },
  };
}
