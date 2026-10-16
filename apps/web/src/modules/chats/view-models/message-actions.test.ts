import type { ChatMessageRole } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import { deriveMessageActions } from './message-actions';

function message(role: ChatMessageRole, content: string) {
  return { content, role };
}

const GREETING = message('assistant', 'Добро пожаловать.');
const ENDS_WITH_REPLY = [message('user', 'Привет!'), message('assistant', '*улыбается* Здравствуй.')];
const ENDS_WITH_USER = [GREETING, message('user', 'Расскажи о себе.')];

const IDLE = {
  blockReason: undefined,
  editing: null,
  hasActiveJob: false,
  isGeneratingFirstMessage: false,
  isMutatingMessages: false,
  isReplyStarting: false,
  messages: ENDS_WITH_REPLY,
};

const NO_ACTIONS = {
  canAnswer: false,
  canChangeMessages: false,
  canContinue: false,
  editingMessageIndex: null,
  isEditStale: false,
  regenerableMessageIndex: null,
};

describe('deriveMessageActions', () => {
  it('offers changes, regenerate and continue on an idle chat that ends with a reply', () => {
    expect(deriveMessageActions(IDLE)).toEqual({
      ...NO_ACTIONS,
      canChangeMessages: true,
      canContinue: true,
      regenerableMessageIndex: 2,
    });
  });

  it('offers an answer, and no continue or regenerate, when a user turn ends the chat', () => {
    expect(deriveMessageActions({ ...IDLE, messages: ENDS_WITH_USER })).toEqual({
      ...NO_ACTIONS,
      canAnswer: true,
      canChangeMessages: true,
    });
  });

  it('offers no continue or answer for a last message that is blank', () => {
    const blankReply = [message('user', 'Привет!'), message('assistant', ' \n ')];
    const blankUser = [GREETING, message('user', '\t')];

    expect(deriveMessageActions({ ...IDLE, messages: blankReply }).canContinue).toBe(false);
    expect(deriveMessageActions({ ...IDLE, messages: blankUser }).canAnswer).toBe(false);
  });

  it('offers no regenerate for a chat that holds only its greeting', () => {
    expect(deriveMessageActions({ ...IDLE, messages: [GREETING] })).toEqual({
      ...NO_ACTIONS,
      canChangeMessages: true,
      canContinue: true,
    });
  });

  it('locks message actions while a reply job is being started', () => {
    expect(deriveMessageActions({ ...IDLE, isReplyStarting: true })).toEqual(NO_ACTIONS);
    expect(deriveMessageActions({ ...IDLE, isReplyStarting: true, messages: ENDS_WITH_USER })).toEqual(NO_ACTIONS);
  });

  it.each([
    ['a reply job runs', { hasActiveJob: true }],
    ['the first message is generated', { isGeneratingFirstMessage: true }],
  ])('locks message actions while %s', (_name, state) => {
    expect(deriveMessageActions({ ...IDLE, ...state })).toEqual(NO_ACTIONS);
  });

  it('locks deleting, branching, regenerating and continuing while a message is edited', () => {
    const editingFirst = { baseContent: 'Привет!', messageIndex: 1 };
    const editingLastUser = { baseContent: 'Расскажи о себе.', messageIndex: 2 };

    expect(deriveMessageActions({ ...IDLE, editing: editingFirst })).toEqual({
      ...NO_ACTIONS,
      editingMessageIndex: 1,
    });
    expect(deriveMessageActions({ ...IDLE, editing: editingLastUser, messages: ENDS_WITH_USER })).toEqual({
      ...NO_ACTIONS,
      editingMessageIndex: 2,
    });
  });

  it('closes the editor and reports the edit as stale once its position holds other content', () => {
    const editing = { baseContent: 'Привет!', messageIndex: 1 };
    const afterEarlierDelete = ENDS_WITH_REPLY.slice(1);
    const afterTruncate = ENDS_WITH_REPLY.slice(0, 1);

    expect(deriveMessageActions({ ...IDLE, editing, messages: afterEarlierDelete })).toEqual({
      ...NO_ACTIONS,
      isEditStale: true,
    });
    expect(
      deriveMessageActions({
        ...IDLE,
        editing: { baseContent: '*улыбается* Здравствуй.', messageIndex: 2 },
        messages: afterTruncate,
      }),
    ).toEqual({ ...NO_ACTIONS, isEditStale: true });
  });

  it('keeps the editor open while its save replaces the content optimistically', () => {
    const editing = { baseContent: 'Привет!', messageIndex: 1 };
    const optimistic = [message('user', 'Привет, Мария!'), message('assistant', '*улыбается* Здравствуй.')];

    expect(deriveMessageActions({ ...IDLE, editing, isMutatingMessages: true, messages: optimistic })).toEqual({
      ...NO_ACTIONS,
      editingMessageIndex: 1,
    });
  });

  it('locks message changes and generation while a message change is saved', () => {
    expect(deriveMessageActions({ ...IDLE, isMutatingMessages: true })).toEqual(NO_ACTIONS);
    expect(deriveMessageActions({ ...IDLE, isMutatingMessages: true, messages: ENDS_WITH_USER })).toEqual(NO_ACTIONS);
  });

  it('offers no generation while the model is not ready, but keeps message changes', () => {
    expect(deriveMessageActions({ ...IDLE, blockReason: 'Модель не готова.' })).toEqual({
      ...NO_ACTIONS,
      canChangeMessages: true,
    });
  });
});
