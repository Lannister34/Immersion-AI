import type { ChatGenerationSettingsDto, ChatSessionDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';

import { type ChatPromptContext, loadChatPromptContext } from './application/load-chat-prompt-context.js';
import type {
  CharacterDetailReader,
  GenerationSettingsSource,
  LorebookReader,
  ScenarioReader,
} from './application/prompting-ports.js';
import {
  type ResolvedChatGenerationSettings,
  resolveChatGenerationSettings,
} from './application/resolve-chat-generation-settings.js';
import {
  type ChatReplyGenerationPlan,
  type ResolveChatReplyGenerationPlanInput,
  resolveChatReplyGenerationPlan,
} from './application/resolve-chat-reply-generation-plan.js';

export interface PromptingModuleDependencies {
  readonly characters: CharacterDetailReader;
  readonly lorebooks: LorebookReader;
  readonly scenarios: ScenarioReader;
  readonly settings: GenerationSettingsSource;
}

export interface PromptingModule {
  loadChatPromptContext(session: ChatSessionDto): Promise<ChatPromptContext>;
  resolveChatGenerationSettings(
    settings: SettingsOverviewResponse,
    modelName: string | null,
    chatGenerationSettings: ChatGenerationSettingsDto,
  ): ResolvedChatGenerationSettings;
  resolveChatReplyGenerationPlan(input: ResolveChatReplyGenerationPlanInput): Promise<ChatReplyGenerationPlan>;
}

export function createPromptingModule(dependencies: PromptingModuleDependencies): PromptingModule {
  return {
    loadChatPromptContext: (session) => loadChatPromptContext(session, dependencies),
    resolveChatGenerationSettings,
    resolveChatReplyGenerationPlan: (input) => resolveChatReplyGenerationPlan(input, dependencies),
  };
}
