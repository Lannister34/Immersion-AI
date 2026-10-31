import {
  type ChatReplyPromptPreviewResponse,
  ChatReplyPromptPreviewResponseSchema,
  type ContextBudgetStatus,
  type PromptContextWindow,
} from '@immersion/contracts/generation';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test-support/render-with-providers';
import { toContextStats } from '../view-models/context-stats';
import { ContextMeter } from './context-meter';

const ONLY_LAST_MESSAGE = 'только последнее сообщение';

interface PreviewFixture {
  budgetStatus: ContextBudgetStatus;
  contextWindow?: PromptContextWindow;
  maxContextLength: number;
  maxTokens: number;
  transcriptMessageCount: number;
  trimmedMessageCount: number;
}

function buildPreview(fixture: PreviewFixture): ChatReplyPromptPreviewResponse {
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
        finalTotal: 120,
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

async function renderMeter(fixture: PreviewFixture) {
  const stats = toContextStats(buildPreview(fixture));
  if (!stats) throw new Error('the preview fixture produced no context stats');

  return renderWithProviders(<ContextMeter stats={stats} />);
}

function rowText(label: string): string | null {
  return screen.getByText(label).parentElement?.textContent ?? null;
}

describe('ContextMeter', () => {
  it('shows without opening that only the last message fits when the reply limit reaches the context', async () => {
    await renderMeter({
      budgetStatus: 'reply-exceeds-context',
      maxContextLength: 32_768,
      maxTokens: 32_768,
      transcriptMessageCount: 1,
      trimmedMessageCount: 39,
    });

    expect(screen.getByText(ONLY_LAST_MESSAGE)).toBeTruthy();
  });

  it('lists the trimmed messages and the reply limit beside the context window', async () => {
    await renderMeter({
      budgetStatus: 'reply-exceeds-context',
      maxContextLength: 32_768,
      maxTokens: 32_768,
      transcriptMessageCount: 1,
      trimmedMessageCount: 39,
    });

    fireEvent.click(screen.getByTitle('Подробности о контексте'));

    expect(rowText('обрезано сообщений')).toBe('обрезано сообщений39');
    expect(rowText('сообщений в промпте')).toBe('сообщений в промпте1');
    expect(rowText('лимит ответа')).toBe(`лимит ответа${(32_768).toLocaleString('ru-RU')}`);
    expect(rowText('окно контекста')).toBe(`окно контекста${(32_768).toLocaleString('ru-RU')}`);
  });

  it('counts trimmed messages without the warning when a valid budget only drops older history', async () => {
    await renderMeter({
      budgetStatus: 'trimmed',
      maxContextLength: 8192,
      maxTokens: 600,
      transcriptMessageCount: 12,
      trimmedMessageCount: 7,
    });

    expect(screen.queryByText(ONLY_LAST_MESSAGE)).toBeNull();

    fireEvent.click(screen.getByTitle('Подробности о контексте'));

    expect(rowText('обрезано сообщений')).toBe('обрезано сообщений7');
  });

  it("measures against the built-in server's context and says so when the preset asks for a larger window", async () => {
    await renderMeter({
      budgetStatus: 'trimmed',
      contextWindow: { size: 8192, source: 'runtime' },
      maxContextLength: 32_256,
      maxTokens: 600,
      transcriptMessageCount: 12,
      trimmedMessageCount: 7,
    });

    const badge = screen.getByText('окно ограничено сервером');
    expect(badge.getAttribute('title')).toContain(`предустановка просит ${(32_256).toLocaleString('ru-RU')}`);
    expect(screen.getByTitle('Подробности о контексте').textContent).toContain(`/ ${(8192).toLocaleString('ru-RU')} ·`);

    fireEvent.click(screen.getByTitle('Подробности о контексте'));

    expect(rowText('окно контекста')).toBe(`окно контекста${(8192).toLocaleString('ru-RU')} (сервер)`);
  });

  it('shows no server limit while the preset window fits the server', async () => {
    await renderMeter({
      budgetStatus: 'fits',
      maxContextLength: 8192,
      maxTokens: 600,
      transcriptMessageCount: 3,
      trimmedMessageCount: 0,
    });

    expect(screen.queryByText('окно ограничено сервером')).toBeNull();
  });
});
