import {
  type ChatReplyPromptPreviewResponse,
  ChatReplyPromptPreviewResponseSchema,
  type ContextBudgetStatus,
  type PromptContextWindow,
} from '@immersion/contracts/generation';

export interface ChatReplyPromptPreviewFixture {
  budgetStatus: ContextBudgetStatus;
  contextWindow?: PromptContextWindow;
  maxContextLength: number;
  maxTokens: number;
  transcriptMessageCount: number;
  trimmedMessageCount: number;
  finalTotal?: number;
}

export function buildChatReplyPromptPreview(fixture: ChatReplyPromptPreviewFixture): ChatReplyPromptPreviewResponse {
  const sampling = {
    minP: 0.02,
    presencePenalty: 0,
    repeatPenalty: 1.05,
    repeatPenaltyRange: 2048,
    temperature: 1,
    topK: 0,
    topP: 1,
  };
  const noOverrides = {
    contextTrimStrategy: false,
    maxContextLength: false,
    maxTokens: false,
    minP: false,
    presencePenalty: false,
    repeatPenalty: false,
    repeatPenaltyRange: false,
    temperature: false,
    topK: false,
    topP: false,
  };

  return ChatReplyPromptPreviewResponseSchema.parse({
    chatId: 'nochnaya-gavan',
    diagnostics: {
      budgetStatus: fixture.budgetStatus,
      contextWindow: fixture.contextWindow ?? { size: fixture.maxContextLength, source: 'preset' },
      messageCount: fixture.transcriptMessageCount + 1,
      promptSource: { kind: 'default-template' },
      renderer: {
        cyclicVariables: [],
        invalidVariableTemplates: [],
        truncatedExpansions: [],
        unknownConditions: [],
        unresolvedVariables: [],
      },
      systemMessageCount: 1,
      systemPromptIncluded: true,
      tokenCountMethod: 'exact',
      tokenEstimate: {
        finalTotal: fixture.finalTotal ?? 120,
        promptBudget: 1,
        replyReservation: fixture.maxTokens,
        system: 80,
        transcriptAfterTrim: 40,
        transcriptBeforeTrim: 4000,
      },
      transcriptMessageCount: fixture.transcriptMessageCount,
      trimmedMessageCount: fixture.trimmedMessageCount,
    },
    effectiveSettings: {
      appliedChatOverrides: noOverrides,
      ignoredChatSamplerPresetId: null,
      modelBindingPresetId: null,
      modelName: 'Модель-тест.gguf',
      samplerPresetId: 'dolgiy',
      samplerPresetName: 'Долгий разговор',
      samplerPresetSource: 'active_preset',
      sampling: {
        ...sampling,
        contextTrimStrategy: 'trim_middle',
        maxContextLength: fixture.maxContextLength,
        maxTokens: fixture.maxTokens,
      },
    },
    provider: {
      contextSize: fixture.contextWindow?.source === 'runtime' ? fixture.contextWindow.size : null,
      model: 'Модель-тест.gguf',
      readiness: {
        activeProvider: 'koboldcpp',
        issue: null,
        mode: 'builtin',
        runtime: null,
        status: 'ready',
        visionSupport: 'unknown',
      },
    },
    request: {
      maxTokens: fixture.maxTokens,
      messages: [
        { content: 'Ты капитан шхуны.', role: 'system' },
        { content: 'Держим курс на маяк.', role: 'user' },
      ],
      sampling,
    },
  });
}
