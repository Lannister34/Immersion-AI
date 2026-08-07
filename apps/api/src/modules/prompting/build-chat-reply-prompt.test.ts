import type { ChatSessionDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { PromptCharacterSnapshot } from '@immersion/domain/prompting';
import { describe, expect, it } from 'vitest';
import type { ActiveSamplerPreset } from '../settings/application/active-sampler-preset.js';
import { buildChatReplyPrompt, buildChatReplyPromptBundle } from './application/build-chat-reply-prompt.js';

const settings: SettingsOverviewResponse = {
  profile: {
    responseLanguage: 'none',
    streamingEnabled: false,
    systemPromptTemplate: 'Global system prompt.',
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

const roleplayCharacter: PromptCharacterSnapshot = {
  description: 'Дракон-книжник из Виндхолла.',
  mesExample: null,
  name: 'Эмбер',
  personality: 'Добродушный, любопытный.',
  systemPrompt: null,
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

function buildSession(
  messages: ChatSessionDto['messages'],
  systemPrompt: string | null = null,
  additionalInstructions: string | null = null,
): ChatSessionDto {
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
      title: 'Prompt test',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    generationSettings: {
      additionalInstructions,
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

describe('buildChatReplyPrompt', () => {
  it('uses a chat-owned system prompt instead of the global template', () => {
    const prompt = buildChatReplyPrompt({
      samplerPreset: defaultSamplerPreset,
      session: buildSession(
        [
          {
            attachments: [],
            reasoning: null,
            content: 'Hello.',
            createdAt: '2026-01-01T00:00:00.000Z',
            id: 'm1',
            role: 'user',
          },
        ],
        'Chat-level system prompt for {{user}}.',
      ),
      settings,
    });

    expect(prompt[0]).toMatchObject({
      role: 'system',
      content: 'Chat-level system prompt for Tester.',
    });
    expect(prompt[0]?.content).not.toContain('Global system prompt.');
  });

  it('appends chat additional instructions to the end of the assembled system prompt', () => {
    const prompt = buildChatReplyPrompt({
      character: roleplayCharacter,
      characterScenarioContent: 'Ночь, метель, постоялый двор.',
      lorebookSections: ['Виндхолл — город на скале.'],
      samplerPreset: defaultSamplerPreset,
      session: buildSession(
        [
          {
            attachments: [],
            content: 'Привет.',
            createdAt: '2026-01-01T00:00:00.000Z',
            id: 'm1',
            reasoning: null,
            role: 'user',
          },
        ],
        null,
        'Отвечай короче обычного.',
      ),
      settings,
    });
    const systemContent = prompt[0]?.content ?? '';

    expect(prompt[0]?.role).toBe('system');
    expect(systemContent).toContain('Виндхолл — город на скале.');
    expect(systemContent.trimEnd().endsWith('Отвечай короче обычного.')).toBe(true);
  });

  it('lets a manual chat prompt replace the whole assembled system message', () => {
    const prompt = buildChatReplyPrompt({
      character: roleplayCharacter,
      characterScenarioContent: 'Ночь, метель, постоялый двор.',
      lorebookSections: ['Виндхолл — город на скале.'],
      samplerPreset: defaultSamplerPreset,
      session: buildSession(
        [
          {
            attachments: [],
            content: 'Привет.',
            createdAt: '2026-01-01T00:00:00.000Z',
            id: 'm1',
            reasoning: null,
            role: 'user',
          },
        ],
        'Только этот текст уходит в модель.',
        'Эти инструкции применяться не должны.',
      ),
      settings: {
        ...settings,
        profile: { ...settings.profile, responseLanguage: 'ru' },
      },
    });

    expect(prompt[0]).toEqual({
      role: 'system',
      content: 'Только этот текст уходит в модель.',
    });
  });

  it('does not add global prompt context to generic chats without an explicit chat prompt', () => {
    const prompt = buildChatReplyPrompt({
      samplerPreset: defaultSamplerPreset,
      session: buildSession([
        {
          attachments: [],
          reasoning: null,
          content: 'Привет.',
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'm1',
          role: 'user',
        },
      ]),
      settings: {
        ...settings,
        profile: {
          ...settings.profile,
          responseLanguage: 'ru',
          systemPromptTemplate: 'Roleplay prompt for {{user}}. Persona: {{userPersona}}.',
          userPersona: 'RP persona that must not leak into plain chats.',
        },
      },
    });

    expect(prompt).toEqual([
      {
        role: 'user',
        content: 'Привет.',
      },
    ]);
  });

  it('trims old transcript messages with trim_start when context budget is exceeded', () => {
    const prompt = buildChatReplyPrompt({
      samplerPreset: {
        ...defaultSamplerPreset,
        contextTrimStrategy: 'trim_start',
        maxContextLength: 10,
        maxTokens: 1,
      },
      session: buildSession([
        {
          attachments: [],
          reasoning: null,
          content: 'old message that should be trimmed',
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'm1',
          role: 'user',
        },
        {
          attachments: [],
          reasoning: null,
          content: 'latest message stays even if it is large',
          createdAt: '2026-01-01T00:00:01.000Z',
          id: 'm2',
          role: 'user',
        },
      ]),
      settings,
    });

    expect(prompt.map((message) => message.content).join('\n')).not.toContain('old message');
    expect(prompt.map((message) => message.content).join('\n')).toContain('latest message');
  });

  it('trims middle transcript messages with trim_middle when context budget is exceeded', () => {
    const prompt = buildChatReplyPrompt({
      samplerPreset: {
        ...defaultSamplerPreset,
        contextTrimStrategy: 'trim_middle',
        maxContextLength: 32,
        maxTokens: 1,
      },
      session: buildSession([
        {
          attachments: [],
          reasoning: null,
          content: 'FIRST edge',
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'm1',
          role: 'user',
        },
        {
          attachments: [],
          reasoning: null,
          content: 'MIDDLE '.repeat(20),
          createdAt: '2026-01-01T00:00:01.000Z',
          id: 'm2',
          role: 'assistant',
        },
        {
          attachments: [],
          reasoning: null,
          content: 'LATEST edge',
          createdAt: '2026-01-01T00:00:02.000Z',
          id: 'm3',
          role: 'user',
        },
      ]),
      settings,
    });
    const content = prompt.map((message) => message.content).join('\n');

    expect(content).toContain('FIRST edge');
    expect(content).not.toContain('MIDDLE');
    expect(content).toContain('LATEST edge');
  });

  it('reserves reply tokens before applying the prompt context budget', () => {
    const bundle = buildChatReplyPromptBundle({
      samplerPreset: {
        ...defaultSamplerPreset,
        contextTrimStrategy: 'trim_start',
        maxContextLength: 48,
        maxTokens: 24,
      },
      session: buildSession([
        {
          attachments: [],
          reasoning: null,
          content: 'old '.repeat(80),
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'm1',
          role: 'user',
        },
        {
          attachments: [],
          reasoning: null,
          content: 'latest message stays',
          createdAt: '2026-01-01T00:00:01.000Z',
          id: 'm2',
          role: 'user',
        },
      ]),
      settings,
    });
    const content = bundle.messages.map((message) => message.content).join('\n');

    expect(bundle.diagnostics.tokenEstimate).toMatchObject({
      promptBudget: 24,
      replyReservation: 24,
    });
    expect(bundle.diagnostics.trimmedMessageCount).toBeGreaterThan(0);
    expect(content).not.toContain('old old');
    expect(content).toContain('latest message stays');
  });
});
