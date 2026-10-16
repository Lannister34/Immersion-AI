import type { ChatMessageRole } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import { findRegenerableMessageIndex } from './regenerable-message';

function transcript(...roles: ChatMessageRole[]) {
  return roles.map((role) => ({ role }));
}

describe('findRegenerableMessageIndex', () => {
  it.each([
    ['an empty chat', transcript()],
    ['a greeting', transcript('assistant')],
    ['two greetings', transcript('assistant', 'assistant')],
  ])('offers no regenerate for a chat that holds only its greeting: %s', (_name, messages) => {
    expect(findRegenerableMessageIndex(messages)).toBeNull();
  });

  it.each([
    ['greeting then user', transcript('assistant', 'user')],
    ['a lone user turn', transcript('user')],
    ['a full exchange then user', transcript('user', 'assistant', 'user')],
  ])('offers no regenerate when a user turn ends the transcript: %s', (_name, messages) => {
    expect(findRegenerableMessageIndex(messages)).toBeNull();
  });

  it.each([
    ['user, system, assistant', transcript('user', 'system', 'assistant')],
    ['system, assistant', transcript('system', 'assistant')],
    ['user, system, two replies', transcript('user', 'system', 'assistant', 'assistant')],
  ])('offers no regenerate when a system line precedes the last reply: %s', (_name, messages) => {
    expect(findRegenerableMessageIndex(messages)).toBeNull();
  });

  it('offers no regenerate when the transcript ends with a system line', () => {
    expect(findRegenerableMessageIndex(transcript('user', 'assistant', 'system'))).toBeNull();
  });

  it.each([
    ['user, assistant', transcript('user', 'assistant'), 2],
    ['greeting, user, assistant', transcript('assistant', 'user', 'assistant'), 3],
    ['user, two replies', transcript('user', 'assistant', 'assistant'), 3],
    ['system, user, assistant', transcript('system', 'user', 'assistant'), 3],
  ])('offers regenerate on the last reply when a user turn precedes the assistant run: %s', (_name, messages, expected) => {
    expect(findRegenerableMessageIndex(messages)).toBe(expected);
  });
});
