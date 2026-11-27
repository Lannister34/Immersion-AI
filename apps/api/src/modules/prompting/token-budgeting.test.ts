import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { SamplerPresetSummary, SettingsOverviewResponse } from '@immersion/contracts/settings';
import { describe, expect, it } from 'vitest';
import { buildChatReplyPromptBundleWithTokenCounter } from './application/build-chat-reply-prompt.js';
import type { TokenCounter } from './application/token-counter.js';

const settings: SettingsOverviewResponse = {
  profile: {
    responseLanguage: 'none',
    streamingEnabled: false,
    systemPromptTemplate: '',
    thinkingEnabled: true,
    messageFormatting: { actionsItalic: true, quotesHighlighted: false },
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

const defaultSamplerPreset: SamplerPresetSummary = {
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
    reasoning: null,
    stoppedAtTokenLimit: false,
    role: 'user',
  };
}

interface RecordingTokenCounter extends TokenCounter {
  calls: string[][];
}

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
  it('trims the oldest messages by real token counts with trim_start, counting the system prompt inside the budget left after the reply reservation', async () => {
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

  it('pins the continued message together with the trailing instruction even over budget, trimming only older messages', async () => {
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
    expect(bundle.diagnostics.budgetStatus).toBe('fits');
    expect(tokenCounter.calls).toHaveLength(1);
  });
});

describe('context budget status', () => {
  const history = [
    userMessage('m1', 'Привет, капитан.'),
    userMessage('m2', 'Шторм усиливается.'),
    userMessage('m3', 'Держим курс на маяк.'),
  ];

  it('reports reply-exceeds-context and keeps only the last message when the reply limit equals the context', async () => {
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: { ...defaultSamplerPreset, maxContextLength: 32_768, maxTokens: 32_768 },
        session: buildSession(history, 'Системный промпт'),
        settings,
      },
      buildFakeTokenCounter({}),
    );

    expect(bundle.diagnostics.budgetStatus).toBe('reply-exceeds-context');
    expect(bundle.diagnostics.trimmedMessageCount).toBe(2);
    expect(bundle.messages.map((message) => message.content)).toEqual(['Системный промпт', 'Держим курс на маяк.']);
  });

  it('reports trimmed when a valid budget drops older messages', async () => {
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: {
          ...defaultSamplerPreset,
          contextTrimStrategy: 'trim_start',
          maxContextLength: 4,
          maxTokens: 2,
        },
        session: buildSession(history),
        settings,
      },
      buildFakeTokenCounter({}),
    );

    expect(bundle.diagnostics.budgetStatus).toBe('trimmed');
    expect(bundle.diagnostics.trimmedMessageCount).toBe(1);
  });

  it('reports fits when the whole history fits the budget left after the reply limit', async () => {
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: { ...defaultSamplerPreset, maxContextLength: 32_768, maxTokens: 32_764 },
        session: buildSession(history),
        settings,
      },
      buildFakeTokenCounter({}),
    );

    expect(bundle.diagnostics.budgetStatus).toBe('fits');
    expect(bundle.diagnostics.trimmedMessageCount).toBe(0);
  });
});

describe('context budgeting without a reply limit', () => {
  const history = [
    userMessage('m1', 'OLDEST'),
    userMessage('m2', 'MIDDLE'),
    userMessage('m3', 'LATEST'),
  ] satisfies ChatSessionDto['messages'];
  const tokenCounter = (): RecordingTokenCounter =>
    buildFakeTokenCounter({ LATEST: 10_000, MIDDLE: 10_000, OLDEST: 10_000, SYSCUSTOM: 1_000 });

  it('leaves the reply max(2048, context / 8), 6000 of a 48000 window, and gives history the rest', async () => {
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: { ...defaultSamplerPreset, maxContextLength: 48_000, maxTokens: 'unlimited' },
        serverContextSize: 48_000,
        session: buildSession(history, 'SYSCUSTOM prompt'),
        settings,
      },
      tokenCounter(),
    );

    expect(bundle.diagnostics.budgetStatus).toBe('fits');
    expect(bundle.diagnostics.tokenEstimate).toMatchObject({ promptBudget: 42_000, replyReservation: 6000 });
    expect(bundle.messages.map((message) => message.content)).toEqual([
      'SYSCUSTOM prompt',
      'OLDEST',
      'MIDDLE',
      'LATEST',
    ]);
  });

  it('budgets against the window the server runs while a larger preset context waits to be applied', async () => {
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: {
          ...defaultSamplerPreset,
          contextTrimStrategy: 'trim_start',
          maxContextLength: 48_000,
          maxTokens: 'unlimited',
        },
        serverContextSize: 32_256,
        session: buildSession(history, 'SYSCUSTOM prompt'),
        settings,
      },
      tokenCounter(),
    );

    expect(bundle.diagnostics.tokenEstimate).toMatchObject({ promptBudget: 28_224, replyReservation: 4032 });
    expect(bundle.diagnostics.budgetStatus).toBe('trimmed');
    expect(bundle.messages.map((message) => message.content)).toEqual(['SYSCUSTOM prompt', 'MIDDLE', 'LATEST']);
  });

  it('budgets a cloud provider, whose window is unknown, by the preset context', async () => {
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: {
          ...defaultSamplerPreset,
          contextTrimStrategy: 'trim_start',
          maxContextLength: 30_000,
          maxTokens: 'unlimited',
        },
        serverContextSize: null,
        session: buildSession(history, 'SYSCUSTOM prompt'),
        settings,
      },
      tokenCounter(),
    );

    expect(bundle.diagnostics.tokenEstimate).toMatchObject({ promptBudget: 26_250, replyReservation: 3750 });
    expect(bundle.diagnostics.budgetStatus).toBe('trimmed');
    expect(bundle.messages.map((message) => message.content)).toEqual(['SYSCUSTOM prompt', 'MIDDLE', 'LATEST']);
  });

  it('keeps every message and reports unlimited when neither the preset nor the server gives a window', async () => {
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: { ...defaultSamplerPreset, maxContextLength: 0, maxTokens: 'unlimited' },
        serverContextSize: null,
        session: buildSession(history, 'SYSCUSTOM prompt'),
        settings,
      },
      tokenCounter(),
    );

    expect(bundle.diagnostics.budgetStatus).toBe('unlimited');
    expect(bundle.messages).toHaveLength(4);
    expect(bundle.diagnostics.trimmedMessageCount).toBe(0);
  });

  it('keeps the explicit-limit reservation, so 32225 of 32256 leaves 31 tokens and reports the fixed parts that do not fit', async () => {
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: { ...defaultSamplerPreset, maxContextLength: 32_256, maxTokens: 32_225 },
        serverContextSize: 32_256,
        session: buildSession(history, 'SYSCUSTOM prompt'),
        settings,
      },
      tokenCounter(),
    );

    expect(bundle.diagnostics.tokenEstimate).toMatchObject({
      finalTotal: 11_000,
      promptBudget: 31,
      replyReservation: 32_225,
    });
    expect(bundle.diagnostics.budgetStatus).toBe('system-exceeds-budget');
  });

  it('reports a reply limit equal to the context as reply-exceeds-context and keeps only the fixed parts for the preview', async () => {
    const bundle = await buildChatReplyPromptBundleWithTokenCounter(
      {
        samplerPreset: { ...defaultSamplerPreset, maxContextLength: 32_768, maxTokens: 32_768 },
        session: buildSession(history, 'SYSCUSTOM prompt'),
        settings,
      },
      tokenCounter(),
    );

    expect(bundle.diagnostics.budgetStatus).toBe('reply-exceeds-context');
    expect(bundle.messages.map((message) => message.content)).toEqual(['SYSCUSTOM prompt', 'LATEST']);
  });
});
