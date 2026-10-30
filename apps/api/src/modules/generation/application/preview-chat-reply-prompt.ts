import type { ChatSessionDto } from '@immersion/contracts/chats';
import {
  type ChatReplyPromptPreviewCommand,
  type ChatReplyPromptPreviewMessageOverride,
  type ChatReplyPromptPreviewResponse,
  ChatReplyPromptPreviewResponseSchema,
} from '@immersion/contracts/generation';

import { ChatMessageNotFoundError, ChatNotFoundError, deriveLastMessagePreview } from '../../chats/index.js';
import type { TokenCounter } from '../../prompting/index.js';
import { DEFAULT_OPENAI_COMPATIBLE_MODEL } from '../../providers/index.js';
import type { ChatSessionPort, GenerationSettingsSource, PromptPlanPort } from './generation-ports.js';
import { type GenerationReadinessDependencies, getGenerationReadiness } from './get-generation-readiness.js';

export interface PreviewChatReplyPromptDependencies extends GenerationReadinessDependencies {
  readonly chats: Pick<ChatSessionPort, 'getChatSession'>;
  readonly prompting: Pick<PromptPlanPort, 'loadChatPromptContext' | 'resolveChatReplyGenerationPlan'>;
  readonly settings: GenerationSettingsSource;
  readonly tokenCounter: TokenCounter;
}

function withMessageOverrides(
  session: ChatSessionDto,
  overrides: ChatReplyPromptPreviewMessageOverride[] | undefined,
): ChatSessionDto {
  if (!overrides?.length) {
    return session;
  }

  const overrideMap = new Map<number, string>();
  for (const override of overrides) {
    if (override.messageIndex < 1 || override.messageIndex > session.messages.length) {
      throw new ChatMessageNotFoundError(session.chat.id, override.messageIndex);
    }
    overrideMap.set(override.messageIndex, override.content);
  }

  const nextMessages = session.messages.map((message, index) => {
    const content = overrideMap.get(index + 1);
    if (content === undefined) {
      return message;
    }
    return { ...message, content };
  });

  return {
    ...session,
    messages: nextMessages,
    chat: {
      ...session.chat,
      lastMessagePreview: deriveLastMessagePreview(nextMessages.at(-1)?.content),
    },
  };
}

function withDraftUserMessage(session: ChatSessionDto, draftUserMessage: string | undefined): ChatSessionDto {
  const normalizedDraft = draftUserMessage?.trim();

  if (!normalizedDraft) {
    return session;
  }

  const createdAt = new Date(0).toISOString();

  return {
    ...session,
    chat: {
      ...session.chat,
      messageCount: session.chat.messageCount + 1,
      lastMessagePreview: normalizedDraft,
    },
    messages: [
      ...session.messages,
      {
        attachments: [],
        reasoning: null,
        content: normalizedDraft,
        createdAt,
        id: `preview:${session.chat.id}`,
        role: 'user',
      },
    ],
  };
}

interface PreviewProvider {
  contextSize: number | null;
  model: string | null;
}

async function resolvePreviewProvider(dependencies: GenerationReadinessDependencies): Promise<PreviewProvider> {
  const providerSettings = await dependencies.providers.getProviderSettings();

  if (providerSettings.mode === 'builtin') {
    const { serverStatus } = await dependencies.runtime.getRuntimeOverview();

    return {
      contextSize: serverStatus.status === 'running' ? (serverStatus.launchConfig?.contextSize ?? null) : null,
      model: serverStatus.model?.trim() || null,
    };
  }

  const config = providerSettings.providerConfigs[providerSettings.activeProvider];

  return { contextSize: null, model: config?.model?.trim() || DEFAULT_OPENAI_COMPATIBLE_MODEL };
}

export async function previewChatReplyPrompt(
  command: ChatReplyPromptPreviewCommand,
  dependencies: PreviewChatReplyPromptDependencies,
): Promise<ChatReplyPromptPreviewResponse> {
  const session = await dependencies.chats.getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  const [readiness, provider] = await Promise.all([
    getGenerationReadiness(dependencies),
    resolvePreviewProvider(dependencies),
  ]);
  const sessionWithOverrides = withMessageOverrides(session, command.messageOverrides);
  const sessionForPlan = withDraftUserMessage(sessionWithOverrides, command.draftUserMessage);
  const characterContext = await dependencies.prompting.loadChatPromptContext(sessionForPlan);
  const generationPlan = await dependencies.prompting.resolveChatReplyGenerationPlan({
    character: characterContext.character,
    characterScenarioContent: characterContext.characterScenarioContent,
    lorebookSections: characterContext.lorebookSections,
    providerContextSize: provider.contextSize,
    providerModelName: provider.model,
    session: sessionForPlan,
    settings: dependencies.settings.getSettingsOverview(),
    tokenCounter: dependencies.tokenCounter,
  });
  const systemMessageCount = generationPlan.providerRequest.messages.filter(
    (message) => message.role === 'system',
  ).length;

  return ChatReplyPromptPreviewResponseSchema.parse({
    chatId: command.chatId,
    diagnostics: {
      budgetStatus: generationPlan.prompt.diagnostics.budgetStatus,
      contextWindow: generationPlan.contextWindow,
      messageCount: generationPlan.providerRequest.messages.length,
      promptSource: {
        kind: generationPlan.prompt.diagnostics.promptSource.kind,
      },
      renderer: generationPlan.prompt.diagnostics.renderer,
      systemMessageCount,
      systemPromptIncluded: systemMessageCount > 0,
      tokenCountMethod: generationPlan.prompt.diagnostics.tokenCountMethod,
      tokenEstimate: generationPlan.prompt.diagnostics.tokenEstimate,
      transcriptMessageCount: generationPlan.providerRequest.messages.length - systemMessageCount,
      trimmedMessageCount: generationPlan.prompt.diagnostics.trimmedMessageCount,
    },
    effectiveSettings: {
      appliedChatOverrides: generationPlan.effectiveSettings.appliedChatOverrides,
      ignoredChatSamplerPresetId: generationPlan.effectiveSettings.ignoredChatSamplerPresetId,
      modelBindingPresetId: generationPlan.effectiveSettings.modelBindingPresetId,
      modelName: generationPlan.effectiveSettings.modelName,
      samplerPresetId: generationPlan.effectiveSettings.samplerPreset.id,
      samplerPresetName: generationPlan.effectiveSettings.samplerPreset.name,
      samplerPresetSource: generationPlan.effectiveSettings.samplerPresetSource,
      sampling: generationPlan.effectiveSettings.sampling,
    },
    provider: {
      contextSize: provider.contextSize,
      model: provider.model,
      readiness,
    },
    request: {
      maxTokens: generationPlan.providerRequest.maxTokens,
      messages: generationPlan.providerRequest.messages,
      sampling: generationPlan.providerRequest.sampling,
    },
  });
}
