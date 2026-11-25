import { describe, expect, it, vi } from 'vitest';

import { EMPTY_CHAT_DRAFT, setChatDraftText } from './chat-draft';
import { createChatDraftStore } from './chat-draft-store';

describe('createChatDraftStore', () => {
  it('reads one shared empty draft for a chat that has none, so a snapshot stays stable', () => {
    const store = createChatDraftStore();

    expect(store.read('chat-1')).toBe(EMPTY_CHAT_DRAFT);
    expect(store.read('chat-1')).toBe(store.read('chat-1'));
  });

  it('keeps one draft per chat and notifies only that chat', () => {
    const store = createChatDraftStore();
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    store.subscribe('chat-1', first);
    store.subscribe('chat-2', second);

    store.update('chat-1', (draft) => setChatDraftText(draft, 'Привет, маяк'));

    expect(store.read('chat-1').text).toBe('Привет, маяк');
    expect(store.read('chat-2')).toBe(EMPTY_CHAT_DRAFT);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('forgets a draft that became empty', () => {
    const store = createChatDraftStore();
    store.update('chat-1', (draft) => setChatDraftText(draft, 'x'));

    store.update('chat-1', (draft) => setChatDraftText(draft, ''));

    expect(store.read('chat-1')).toBe(EMPTY_CHAT_DRAFT);
  });

  it('drops a discarded chat draft and ignores writes that arrive for it later', () => {
    const store = createChatDraftStore();
    store.update('chat-1', (draft) => setChatDraftText(draft, 'Черновик'));

    store.discard('chat-1');
    store.update('chat-1', (draft) => setChatDraftText(draft, 'Поздняя запись'));

    expect(store.read('chat-1')).toBe(EMPTY_CHAT_DRAFT);
  });
});
