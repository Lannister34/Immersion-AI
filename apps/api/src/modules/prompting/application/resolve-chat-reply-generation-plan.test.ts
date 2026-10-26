import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';

import { InMemoryChatSessions } from '../../../test-support/in-memory-chat-sessions.js';
import { resolveChatReplyGenerationPlan } from './resolve-chat-reply-generation-plan.js';

function settingsWithReplyLimit(maxTokens: number): SettingsOverviewResponse {
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
          maxContextLength: 8192,
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
      { providerModelName: null, session },
      { settings: { getSettingsOverview: () => settingsWithReplyLimit(321) } },
    );

    expect(plan.providerRequest.maxTokens).toBe(321);
  });

  it('plans with the settings snapshot the caller passes instead of its settings source', async () => {
    const plan = await resolveChatReplyGenerationPlan(
      { providerModelName: null, session, settings: settingsWithReplyLimit(456) },
      { settings: { getSettingsOverview: () => settingsWithReplyLimit(321) } },
    );

    expect(plan.providerRequest.maxTokens).toBe(456);
  });
});
