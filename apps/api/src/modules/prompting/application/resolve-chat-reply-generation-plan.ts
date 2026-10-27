import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { PromptContextWindow } from '@immersion/contracts/generation';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { PromptCharacterSnapshot } from '@immersion/domain/prompting';

import {
  buildChatReplyPromptBundleWithTokenCounter,
  type ChatReplyPromptBundle,
  type ChatReplyPromptMessage,
} from './build-chat-reply-prompt.js';
import { resolvePromptContextWindow } from './prompt-context-window.js';
import type { GenerationSettingsSource } from './prompting-ports.js';
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
  contextWindow: PromptContextWindow;
  effectiveSettings: ResolvedChatGenerationSettings;
  prompt: ChatReplyPromptBundle;
  providerRequest: ChatReplyProviderRequestPlan;
}

export interface ResolveChatReplyGenerationPlanInput {
  character?: PromptCharacterSnapshot | null;
  characterScenarioContent?: string | null;
  lorebookSections?: string[];
  messageImages?: ReadonlyMap<string, string[]>;
  providerContextSize: number | null;
  providerModelName: string | null;
  session: ChatSessionDto;
  settings?: SettingsOverviewResponse;
  tokenCounter?: TokenCounter;
  trailingUserInstruction?: string | null;
}

export interface ResolveChatReplyGenerationPlanDependencies {
  readonly settings: GenerationSettingsSource;
}

function toPromptSamplerPreset(
  resolvedSettings: ResolvedChatGenerationSettings,
  contextWindow: PromptContextWindow,
): ResolvedChatGenerationSettings['samplerPreset'] {
  return {
    ...resolvedSettings.samplerPreset,
    contextTrimStrategy: resolvedSettings.sampling.contextTrimStrategy,
    maxContextLength: contextWindow.size,
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
  dependencies: ResolveChatReplyGenerationPlanDependencies,
): Promise<ChatReplyGenerationPlan> {
  const settings = input.settings ?? dependencies.settings.getSettingsOverview();
  const effectiveSettings = resolveChatGenerationSettings(
    settings,
    input.providerModelName,
    input.session.generationSettings,
  );
  const contextWindow = resolvePromptContextWindow(
    effectiveSettings.sampling.maxContextLength,
    input.providerContextSize,
  );
  const prompt = await buildChatReplyPromptBundleWithTokenCounter(
    {
      character: input.character ?? null,
      characterScenarioContent: input.characterScenarioContent ?? null,
      lorebookSections: input.lorebookSections ?? [],
      ...(input.messageImages ? { messageImages: input.messageImages } : {}),
      samplerPreset: toPromptSamplerPreset(effectiveSettings, contextWindow),
      session: input.session,
      settings,
      trailingUserInstruction: input.trailingUserInstruction ?? null,
    },
    input.tokenCounter ?? heuristicTokenCounter,
  );

  return {
    contextWindow,
    effectiveSettings,
    prompt,
    providerRequest: {
      maxTokens: effectiveSettings.sampling.maxTokens,
      messages: prompt.messages,
      sampling: toProviderSampling(effectiveSettings.sampling),
    },
  };
}
