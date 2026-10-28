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

  it('leaves the stored reasoning of earlier replies out of the prompt', () => {
    const prompt = buildChatReplyPrompt({
      samplerPreset: defaultSamplerPreset,
      session: buildSession([
        {
          attachments: [],
          content: 'Привет.',
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'm1',
          reasoning: null,
          role: 'user',
        },
        {
          attachments: [],
          content: 'Здравствуй.',
          createdAt: '2026-01-01T00:00:01.000Z',
          id: 'm2',
          reasoning: 'Прикину тон ответа.',
          role: 'assistant',
        },
        {
          attachments: [],
          content: 'Как дела?',
          createdAt: '2026-01-01T00:00:02.000Z',
          id: 'm3',
          reasoning: null,
          role: 'user',
        },
      ]),
      settings,
    });

    expect(prompt).toContainEqual(expect.objectContaining({ content: 'Здравствуй.', role: 'assistant' }));
    expect(JSON.stringify(prompt)).not.toContain('Прикину тон ответа.');
  });

  it('keeps a message that carries only an image and skips one with neither text nor images', () => {
    const prompt = buildChatReplyPrompt({
      messageImages: new Map([['m2', ['data:image/png;base64,AAAA']]]),
      samplerPreset: defaultSamplerPreset,
      session: buildSession([
        {
          attachments: [],
          content: 'Смотри.',
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'm1',
          reasoning: null,
          role: 'user',
        },
        {
          attachments: [{ id: 'photo.png', mimeType: 'image/png', url: '/api/chats/chat-1/attachments/photo.png' }],
          content: '',
          createdAt: '2026-01-01T00:00:01.000Z',
          id: 'm2',
          reasoning: null,
          role: 'user',
        },
        {
          attachments: [],
          content: '   ',
          createdAt: '2026-01-01T00:00:02.000Z',
          id: 'm3',
          reasoning: null,
          role: 'assistant',
        },
      ]),
      settings,
    });

    expect(prompt).toEqual([
      { content: 'Смотри.', role: 'user' },
      { content: '', images: ['data:image/png;base64,AAAA'], role: 'user' },
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

describe('buildChatReplyPromptBundle character data', () => {
  const cardCharacter: PromptCharacterSnapshot = {
    description: 'Дракон-книжник, наставник {{user}}.',
    mesExample: '<START>\n{{user}}: Что читаешь?\n{{char}}: Летопись Виндхолла, {{user}}.',
    name: 'Эмбер',
    personality: '{{char}} добродушен и любопытен.',
    systemPrompt: null,
  };
  const cardScenario = '{{user}} и {{char}} учатся в одном университете.';
  const renderedCard = {
    description: 'Дракон-книжник, наставник Tester.',
    exampleDialogue: '<START>\nTester: Что читаешь?\nЭмбер: Летопись Виндхолла, Tester.',
    personality: 'Эмбер добродушен и любопытен.',
    scenario: 'Tester и Эмбер учатся в одном университете.',
  };
  const userMessage: ChatSessionDto['messages'][number] = {
    attachments: [],
    content: 'Привет.',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'm1',
    reasoning: null,
    role: 'user',
  };

  function occurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
  }

  function systemContentFor(systemPromptTemplate: string, character: PromptCharacterSnapshot = cardCharacter) {
    const bundle = buildChatReplyPromptBundle({
      character,
      characterScenarioContent: cardScenario,
      samplerPreset: defaultSamplerPreset,
      session: buildSession([userMessage]),
      settings: { ...settings, profile: { ...settings.profile, systemPromptTemplate } },
    });
    const systemMessage = bundle.messages.find((message) => message.role === 'system');

    return { bundle, content: systemMessage?.content ?? '' };
  }

  it('sends each card field exactly once when the settings template references the card fields', () => {
    const { content } = systemContentFor(
      'Ты {{char}}.\n{{description}}\n{{personality}}\n{{scenario}}\n{{mesExample}}',
    );

    expect(occurrences(content, renderedCard.description)).toBe(1);
    expect(occurrences(content, renderedCard.personality)).toBe(1);
    expect(occurrences(content, renderedCard.scenario)).toBe(1);
    expect(occurrences(content, renderedCard.exampleDialogue)).toBe(1);
    expect(occurrences(content, 'Летопись Виндхолла')).toBe(1);
  });

  it('sends each card field exactly once through the default character template', () => {
    const { bundle, content } = systemContentFor('');

    expect(bundle.diagnostics.promptSource.kind).toBe('default-template');
    expect(occurrences(content, renderedCard.description)).toBe(1);
    expect(occurrences(content, renderedCard.personality)).toBe(1);
    expect(occurrences(content, renderedCard.scenario)).toBe(1);
    expect(occurrences(content, renderedCard.exampleDialogue)).toBe(1);
  });

  it('never sends {{user}} or {{char}} from card fields unrendered', () => {
    for (const template of ['', '{{description}} {{personality}} {{scenario}} {{mesExample}}']) {
      const { content } = systemContentFor(template);

      expect(content).not.toMatch(/\{\{\s*(?:user|char)\s*\}\}/u);
    }
  });

  it('carries the example dialogue only through a template that references it', () => {
    const { content } = systemContentFor('Пиши как {{char}} и не говори за {{user}}.');

    expect(content).toBe('Пиши как Эмбер и не говори за Tester.');
    expect(content).not.toContain('Что читаешь?');
    expect(content).not.toContain('Example dialogue');
  });

  it('leaves no empty example dialogue section in the default template for a card without examples', () => {
    const { content } = systemContentFor('', { ...cardCharacter, mesExample: null });

    expect(content).not.toContain('Example dialogue');
    expect(content).not.toMatch(/\n{3,}/u);
    expect(content).toContain(renderedCard.scenario);
  });

  it('keeps a template-looking {{unknown}} in a Cyrillic card field as written, once, and reports it', () => {
    const { bundle, content } = systemContentFor('{{description}}', {
      ...cardCharacter,
      description: 'Ёжик в тумане {{unknown}} — «ёлка», {{char}}.',
    });

    expect(content).toBe('Ёжик в тумане {{unknown}} — «ёлка», Эмбер.');
    expect(occurrences(content, '{{unknown}}')).toBe(1);
    expect(bundle.diagnostics.renderer.unresolvedVariables).toEqual(['unknown']);
  });
});
