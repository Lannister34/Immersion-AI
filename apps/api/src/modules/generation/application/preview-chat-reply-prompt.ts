import type { ChatSessionDto } from '@immersion/contracts/chats';
import {
  type ChatReplyPromptPreviewCommand,
  type ChatReplyPromptPreviewMessageOverride,
  type ChatReplyPromptPreviewResponse,
  ChatReplyPromptPreviewResponseSchema,
} from '@immersion/contracts/generation';
import { ChatMessageNotFoundError, ChatNotFoundError } from '../../chats/application/append-chat-messages.js';
import { getChatSession } from '../../chats/application/get-chat-session.js';
import { resolveChatReplyGenerationPlan } from '../../prompting/application/resolve-chat-reply-generation-plan.js';
import { getProviderSettings } from '../../providers/application/get-provider-settings.js';
import { DEFAULT_OPENAI_COMPATIBLE_MODEL } from '../../providers/domain/provider-settings.js';
import { getRuntimeOverview } from '../../runtime/application/get-runtime-overview.js';
import { getGenerationReadiness } from './get-generation-readiness.js';

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
      lastMessagePreview: nextMessages.at(-1)?.content.slice(0, 160) ?? null,
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
        content: normalizedDraft,
        createdAt,
        id: `preview:${session.chat.id}`,
        role: 'user',
      },
    ],
  };
}

async function resolvePreviewModelName(): Promise<string | null> {
  const providerSettings = await getProviderSettings();

  if (providerSettings.mode === 'builtin') {
    return getRuntimeOverview().serverStatus.model?.trim() || null;
  }

  const config = providerSettings.providerConfigs[providerSettings.activeProvider];

  return config?.model?.trim() || DEFAULT_OPENAI_COMPATIBLE_MODEL;
}

export async function previewChatReplyPrompt(
  command: ChatReplyPromptPreviewCommand,
): Promise<ChatReplyPromptPreviewResponse> {
  const session = await getChatSession(command.chatId);

  if (!session) {
    throw new ChatNotFoundError(command.chatId);
  }

  const [readiness, providerModelName] = await Promise.all([getGenerationReadiness(), resolvePreviewModelName()]);
  const sessionWithOverrides = withMessageOverrides(session, command.messageOverrides);
  const generationPlan = resolveChatReplyGenerationPlan({
    providerModelName,
    session: withDraftUserMessage(sessionWithOverrides, command.draftUserMessage),
  });
  const systemMessageCount = generationPlan.providerRequest.messages.filter(
    (message) => message.role === 'system',
  ).length;

  return ChatReplyPromptPreviewResponseSchema.parse({
    chatId: command.chatId,
    diagnostics: {
      messageCount: generationPlan.providerRequest.messages.length,
      promptSource: {
        kind: generationPlan.prompt.diagnostics.promptSource.kind,
      },
      renderer: generationPlan.prompt.diagnostics.renderer,
      systemMessageCount,
      systemPromptIncluded: systemMessageCount > 0,
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
      model: providerModelName,
      readiness,
    },
    request: {
      maxTokens: generationPlan.providerRequest.maxTokens,
      messages: generationPlan.providerRequest.messages,
      sampling: generationPlan.providerRequest.sampling,
    },
  });
}
