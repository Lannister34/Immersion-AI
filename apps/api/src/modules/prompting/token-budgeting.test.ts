import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';
import type { ActiveSamplerPreset } from '../settings/application/active-sampler-preset.js';
import { buildChatReplyPromptBundleWithTokenCounter } from './application/build-chat-reply-prompt.js';
import type { TokenCounter } from './application/token-counter.js';

const settings: SettingsOverviewResponse = {
  profile: {
    responseLanguage: 'none',
    streamingEnabled: false,
    systemPromptTemplate: '',
    thinkingEnabled: true,
    messageFormatting: { actionsItalic: true, quotesHighlighted: false },
    uiLanguage: 'ru',
    userName: 'Tester',
    userPersona: '',
  },
  sampler: {
    activePresetId: 'default',
    modelBindingCount: 0,
    modelBindings: [],
    presets: [],
  },
};

const defaultSamplerPreset: ActiveSamplerPreset = {
  contextTrimStrategy: 'trim_middle',
  id: 'default',
  maxContextLength: 8192,
  maxTokens: 600,
  minP: 0,
  name: 'Default',
  presencePenalty: 0,
  repeatPenalty: 1,
  repeatPenaltyRange: 0,
  temperature: 1,
  topK: 0,
  topP: 1,
};

function buildSession(messages: ChatSessionDto['messages'], systemPrompt: string | null = null): ChatSessionDto {
  return {
    characterAvatarUrl: null,
    characterId: null,
    characterName: null,
    scenarioId: null,
    scenarioName: null,
    lorebookIds: [],
    chat: {
      characterAvatarUrl: null,
      characterId: null,
      characterName: null,
      scenarioId: null,
      scenarioName: null,
      lorebookIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'chat-1',
      lastMessagePreview: null,
      messageCount: messages.length,
      title: 'Budget test',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    generationSettings: {
      additionalInstructions: null,
      samplerPresetId: null,
      sampling: {
        contextTrimStrategy: null,
        maxContextLength: null,
        maxTokens: null,
        minP: null,
        presencePenalty: null,
        repeatPenalty: null,
        repeatPenaltyRange: null,
        temperature: null,
        topK: null,
        topP: null,
      },
      systemPrompt,
    },
    messages,
    userName: 'Tester',
  };
}

function userMessage(id: string, content: string): ChatSessionDto['messages'][number] {
  return {
    attachments: [],
    content,
    createdAt: '2026-01-01T00:00:00.000Z',
    id,
    role: 'user',
  };
}

interface RecordingTokenCounter extends TokenCounter {
  calls: string[][];
}

/**
 * Deterministic fake: the cost of a text is looked up by substring match,
 * with a fallback of 1 token. Counts every call for cache-path assertions.
 */
function buildFakeTokenCounter(costsBySubstring: Record<string, number>): RecordingTokenCounter {
  const calls: string[][] = [];

  return {
    calls,
    countTokens: (texts) => {
      calls.push(texts);

      return Promise.resolve({
        counts: texts.map((text) => {
          for (const [needle, cost] of Object.entries(costsBySubstring)) {
            if (text.includes(needle)) {
              return cost;
            }
          }

          return 1;
        }),
        method: 'exact' as const,
      });
    },
  };
}

describe('token-accurate context budgeting', () => {
  it('trims the oldest messages by real token counts with trim_start and reserves reply tokens', async () => {
    const tokenCounter = buildFakeTokenCounter({
      LATEST: 10,
      MIDDLE: 10,
      OLDEST: 10,
      SYSCUSTOM: 5,
    });
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: {
          ...defaultSamplerPreset,
          contextTrimStrategy: 'trim_start',
          maxContextLength: 25,
          maxTokens: 5,
        },
        session: buildSession(
          [userMessage('m1', 'OLDEST'), userMessage('m2', 'MIDDLE'), userMessage('m3', 'LATEST')],
          'SYSCUSTOM prompt',
        ),
        settings,
      },
      tokenCounter,
    );

    // Reply reservation: 25 - 5 = 20 prompt tokens; system (5) counts inside it.
    expect(bundle.diagnostics.tokenEstimate).toMatchObject({
      finalTotal: 15,
      promptBudget: 20,
      replyReservation: 5,
      system: 5,
      transcriptAfterTrim: 10,
      transcriptBeforeTrim: 30,
    });
    expect(bundle.diagnostics.tokenCountMethod).toBe('exact');
    expect(bundle.diagnostics.trimmedMessageCount).toBe(2);
    expect(bundle.messages.map((message) => message.content)).toEqual(['SYSCUSTOM prompt', 'LATEST']);
  });

  it('drops middle messages by real token counts with trim_middle', async () => {
    const tokenCounter = buildFakeTokenCounter({
      FIRST: 5,
      LATEST: 5,
      MIDDLE: 10,
    });
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: {
          ...defaultSamplerPreset,
          contextTrimStrategy: 'trim_middle',
          maxContextLength: 16,
          maxTokens: 4,
        },
        session: buildSession([userMessage('m1', 'FIRST'), userMessage('m2', 'MIDDLE'), userMessage('m3', 'LATEST')]),
        settings,
      },
      tokenCounter,
    );

    expect(bundle.messages.map((message) => message.content)).toEqual(['FIRST', 'LATEST']);
    expect(bundle.diagnostics.trimmedMessageCount).toBe(1);
    expect(bundle.diagnostics.tokenEstimate.finalTotal).toBe(10);
  });

  it('pins the continued message together with the trailing instruction even over budget', async () => {
    const tokenCounter = buildFakeTokenCounter({
      CONTINUE: 8,
      LATEST: 5,
      OLD: 6,
    });
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: {
          ...defaultSamplerPreset,
          contextTrimStrategy: 'trim_start',
          maxContextLength: 12,
          maxTokens: 2,
        },
        session: buildSession([userMessage('m1', 'OLD'), userMessage('m2', 'LATEST')]),
        settings,
        trailingUserInstruction: 'CONTINUE the reply.',
      },
      tokenCounter,
    );

    // Бюджет 10, а хвост LATEST(5) + инструкция(8) = 13: продолжаемое сообщение
    // нельзя вытеснять — «продолжай» без самого текста порождает бессмыслицу.
    // Старые сообщения (OLD) обрезаются, допустимое переполнение остаётся.
    expect(bundle.messages).toEqual([
      {
        role: 'user',
        content: 'LATEST',
      },
      {
        role: 'user',
        content: 'CONTINUE the reply.',
      },
    ]);
    expect(bundle.diagnostics.tokenEstimate.transcriptAfterTrim).toBe(13);
    expect(bundle.diagnostics.tokenEstimate.transcriptBeforeTrim).toBe(19);
    expect(bundle.diagnostics.trimmedMessageCount).toBe(1);
  });

  it('keeps the trailing instruction last when the transcript fits the budget', async () => {
    const tokenCounter = buildFakeTokenCounter({
      CONTINUE: 3,
      LATEST: 2,
      OLD: 2,
    });
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: {
          ...defaultSamplerPreset,
          contextTrimStrategy: 'trim_middle',
          maxContextLength: 100,
          maxTokens: 10,
        },
        session: buildSession([userMessage('m1', 'OLD'), userMessage('m2', 'LATEST')]),
        settings,
        trailingUserInstruction: 'CONTINUE the reply.',
      },
      tokenCounter,
    );

    expect(bundle.messages.map((message) => message.content)).toEqual(['OLD', 'LATEST', 'CONTINUE the reply.']);
    expect(bundle.diagnostics.trimmedMessageCount).toBe(0);
    expect(tokenCounter.calls).toHaveLength(1);
  });
});
