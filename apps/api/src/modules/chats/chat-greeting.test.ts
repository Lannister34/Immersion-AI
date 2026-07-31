import { describe, expect, it } from 'vitest';

import { renderChatGreeting } from './application/chat-greeting.js';

describe('renderChatGreeting', () => {
  it('substitutes the user and character names', () => {
    const greeting = renderChatGreeting('— Привет, {{user}}. Я {{char}}.', {
      characterName: 'Камила',
      userName: 'Миша',
    });

    expect(greeting).toBe('— Привет, Миша. Я Камила.');
  });

  it('keeps a greeting without placeholders as it was written', () => {
    expect(renderChatGreeting('Лёд ещё пустой.', { userName: 'Миша' })).toBe('Лёд ещё пустой.');
  });

  it('drops a character placeholder when the chat has no character', () => {
    expect(renderChatGreeting('{{char}} молчит, {{user}}.', { userName: 'Миша' })).toBe('молчит, Миша.');
  });

  it('resolves the scenario placeholder from the bound scenario', () => {
    const greeting = renderChatGreeting('Сцена: {{scenario}}', {
      scenarioContent: 'Ледовая арена, поздний вечер.',
      userName: 'Миша',
    });

    expect(greeting).toBe('Сцена: Ледовая арена, поздний вечер.');
  });
});
