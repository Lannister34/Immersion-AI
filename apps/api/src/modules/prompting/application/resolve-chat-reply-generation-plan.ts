import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { PromptCharacterSnapshot } from '@immersion/domain/prompting';

import { getSettingsOverview } from '../../settings/application/get-settings-overview.js';
import {
  buildChatReplyPromptBundleWithTokenCounter,
  type ChatReplyPromptBundle,
  type ChatReplyPromptMessage,
} from './build-chat-reply-prompt.js';
import {
  type ResolvedChatGenerationSamplingSettings,
  type ResolvedChatGenerationSettings,
  resolveChatGenerationSettings,
} from './resolve-chat-generation-settings.js';
import { heuristicTokenCounter, type TokenCounter } from './token-counter.js';

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
  lorebookSections?: string[];
  providerModelName: string | null;
  session: ChatSessionDto;
  settings?: SettingsOverviewResponse;
  /** Exact counter wired at composition; defaults to the chars/4 heuristic. */
  tokenCounter?: TokenCounter;
  /** Trailing user instruction (continue/opening) budgeted with the prompt. */
  trailingUserInstruction?: string | null;
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

export async function resolveChatReplyGenerationPlan(
  input: ResolveChatReplyGenerationPlanInput,
): Promise<ChatReplyGenerationPlan> {
  const settings = input.settings ?? getSettingsOverview();
  const effectiveSettings = resolveChatGenerationSettings(
    settings,
    input.providerModelName,
    input.session.generationSettings,
  );
  const prompt = await buildChatReplyPromptBundleWithTokenCounter(
    {
      character: input.character ?? null,
      characterScenarioContent: input.characterScenarioContent ?? null,
      lorebookSections: input.lorebookSections ?? [],
      samplerPreset: toPromptSamplerPreset(effectiveSettings),
      session: input.session,
      settings,
      trailingUserInstruction: input.trailingUserInstruction ?? null,
    },
    input.tokenCounter ?? heuristicTokenCounter,
  );

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
