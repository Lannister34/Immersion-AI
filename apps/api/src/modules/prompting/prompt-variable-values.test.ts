import { describe, expect, it } from 'vitest';

import { buildPromptInputSnapshot } from './application/prompt-input-snapshot.js';
import { buildPromptVariableValues } from './application/prompt-variable-values.js';

describe('prompt variable values', () => {
  it('projects the current canonical prompt variables from the snapshot', () => {
    const snapshot = buildPromptInputSnapshot({
      character: {
        description: 'Private detective.',
        mesExample: '<START>\n{{char}}: Quiet.',
        name: 'Morgan',
        personality: 'Reserved',
        systemPrompt: '{{char}} does not trust {{user}}.',
      },
      chat: {
        id: 'chat-1',
      },
      generation: {
        maxContextTokens: 8192,
        replyMaxTokens: 600,
        trimStrategy: 'trim_middle',
      },
      scenario: {
        content: '{{user}} arrives for a late-night interrogation with {{char}}.',
        name: 'Interrogation',
      },
      settings: {
        defaultSystemPromptTemplate: 'DEFAULT_PROMPT',
        responseLanguage: 'ru',
        thinkingEnabled: true,
      },
      user: {
        name: 'Alex',
        persona: 'Witness',
      },
    });

    expect(buildPromptVariableValues(snapshot)).toEqual({
      'character.description': 'Private detective.',
      'character.exampleDialogue': '<START>\n{{char}}: Quiet.',
      'character.name': 'Morgan',
      'character.personality': 'Reserved',
      'scenario.content': '{{user}} arrives for a late-night interrogation with {{char}}.',
      'user.name': 'Alex',
      'user.persona': 'Witness',
    });
  });

  it('prefers chat-specific user overrides over base user values', () => {
    const snapshot = buildPromptInputSnapshot({
      chat: {
        customUserName: 'Igor',
        customUserPersona: '',
        id: 'chat-2',
      },
      generation: {
        maxContextTokens: 8192,
        replyMaxTokens: 600,
        trimStrategy: 'trim_middle',
      },
      settings: {
        defaultSystemPromptTemplate: 'DEFAULT_PROMPT',
        responseLanguage: 'ru',
        thinkingEnabled: true,
      },
      user: {
        name: 'Alex',
        persona: 'Witness',
      },
    });

    expect(buildPromptVariableValues(snapshot)).toMatchObject({
      'user.name': 'Igor',
      'user.persona': '',
    });
  });

  it('uses the legacy User fallback for an explicit empty chat user name', () => {
    const snapshot = buildPromptInputSnapshot({
      chat: {
        customUserName: '',
        id: 'chat-3',
      },
      generation: {
        maxContextTokens: 8192,
        replyMaxTokens: 600,
        trimStrategy: 'trim_middle',
      },
      settings: {
        defaultSystemPromptTemplate: 'DEFAULT_PROMPT',
        responseLanguage: 'en',
        thinkingEnabled: true,
      },
      user: {
        name: 'Alex',
      },
    });

    expect(buildPromptVariableValues(snapshot)['user.name']).toBe('User');
  });

  it('uses the legacy User fallback when no user name is available anywhere', () => {
    const snapshot = buildPromptInputSnapshot({
      chat: {
        id: 'chat-4',
      },
      generation: {
        maxContextTokens: 8192,
        replyMaxTokens: 600,
        trimStrategy: 'trim_middle',
      },
      settings: {
        defaultSystemPromptTemplate: 'DEFAULT_PROMPT',
        responseLanguage: 'en',
        thinkingEnabled: true,
      },
    });

    expect(buildPromptVariableValues(snapshot)).toMatchObject({
      'user.name': 'User',
      'user.persona': null,
    });
  });

  it('freezes the projected values object', () => {
    const snapshot = buildPromptInputSnapshot({
      chat: {
        id: 'chat-5',
      },
      generation: {
        maxContextTokens: 8192,
        replyMaxTokens: 600,
        trimStrategy: 'trim_middle',
      },
      settings: {
        defaultSystemPromptTemplate: 'DEFAULT_PROMPT',
        responseLanguage: 'ru',
        thinkingEnabled: true,
      },
      user: {
        name: 'Alex',
      },
    });

    expect(Object.isFrozen(buildPromptVariableValues(snapshot))).toBe(true);
  });
});
