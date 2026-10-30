import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';

import { InMemoryChatSessions } from '../../../test-support/in-memory-chat-sessions.js';
import { resolveChatReplyGenerationPlan } from './resolve-chat-reply-generation-plan.js';

function settingsWithReplyLimit(maxTokens: number, maxContextLength = 8192): SettingsOverviewResponse {
  return {
    profile: {
      messageFormatting: { actionsItalic: true, quotesHighlighted: false },
      responseLanguage: 'ru',
      streamingEnabled: false,
      systemPromptTemplate: '',
      thinkingEnabled: false,
      userName: 'Тестер',
      userPersona: '',
    },
    sampler: {
      activePresetId: 'active',
      modelBindingCount: 0,
      modelBindings: [],
      presets: [
        {
          contextTrimStrategy: 'trim_middle',
          id: 'active',
          maxContextLength,
          maxTokens,
          minP: 0.02,
          name: 'Active',
          presencePenalty: 0,
          repeatPenalty: 1.05,
          repeatPenaltyRange: 2048,
          temperature: 0.65,
          topK: 0,
          topP: 1,
        },
      ],
    },
  };
}

describe('resolveChatReplyGenerationPlan', () => {
  const session = new InMemoryChatSessions().create('chat-plan', '2026-04-01T11:00:00.000Z');

  it('reads the settings from its settings source when the input carries none', async () => {
    const plan = await resolveChatReplyGenerationPlan(
      { providerContextSize: null, providerModelName: null, session },
      { settings: { getSettingsOverview: () => settingsWithReplyLimit(321) } },
    );

    expect(plan.providerRequest.maxTokens).toBe(321);
  });

  it('plans with the settings snapshot the caller passes instead of its settings source', async () => {
    const plan = await resolveChatReplyGenerationPlan(
      { providerContextSize: null, providerModelName: null, session, settings: settingsWithReplyLimit(456) },
      { settings: { getSettingsOverview: () => settingsWithReplyLimit(321) } },
    );

    expect(plan.providerRequest.maxTokens).toBe(456);
  });

  it("trims the transcript to the running llama-server's context when the preset asks for more, since the server would cut the prompt silently", async () => {
    const chats = new InMemoryChatSessions();
    chats.create('chat-long', '2026-04-01T11:00:00.000Z');
    const longSession = await chats.appendChatMessages(
      'chat-long',
      Array.from({ length: 20 }, (_, index) => ({
        content: `Реплика ${index}: ${'слово '.repeat(400)}`,
        createdAt: '2026-04-01T11:00:00.000Z',
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      })),
    );
    const settings = settingsWithReplyLimit(512, 32_256);

    const clamped = await resolveChatReplyGenerationPlan(
      { providerContextSize: 8192, providerModelName: null, session: longSession, settings },
      { settings: { getSettingsOverview: () => settings } },
    );
    const unclamped = await resolveChatReplyGenerationPlan(
      { providerContextSize: null, providerModelName: null, session: longSession, settings },
      { settings: { getSettingsOverview: () => settings } },
    );

    expect(clamped.contextWindow).toEqual({ size: 8192, source: 'runtime' });
    expect(clamped.prompt.diagnostics.tokenEstimate.promptBudget).toBe(8192 - 512);
    expect(clamped.prompt.diagnostics.tokenEstimate.finalTotal).toBeLessThanOrEqual(8192 - 512);
    expect(clamped.prompt.diagnostics.trimmedMessageCount).toBeGreaterThan(0);
    expect(clamped.effectiveSettings.sampling.maxContextLength).toBe(32_256);
    expect(unclamped.contextWindow).toEqual({ size: 32_256, source: 'preset' });
    expect(unclamped.prompt.diagnostics.trimmedMessageCount).toBe(0);
  });
});
