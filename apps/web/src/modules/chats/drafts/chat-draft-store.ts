import { type ChatDraftState, EMPTY_CHAT_DRAFT, isEmptyChatDraft } from './chat-draft';

export type ChatDraftTransition = (draft: ChatDraftState) => ChatDraftState;

export interface ChatDraftStore {
  discard(chatId: string): void;
  read(chatId: string): ChatDraftState;
  subscribe(chatId: string, listener: () => void): () => void;
  update(chatId: string, transition: ChatDraftTransition): void;
}

export function createChatDraftStore(): ChatDraftStore {
  const drafts = new Map<string, ChatDraftState>();
  const listeners = new Map<string, Set<() => void>>();
  const discarded = new Set<string>();

  const notify = (chatId: string) => {
    for (const listener of listeners.get(chatId) ?? []) {
      listener();
    }
  };

  return {
    discard(chatId) {
      discarded.add(chatId);
      drafts.delete(chatId);
      notify(chatId);
    },
    read(chatId) {
      return drafts.get(chatId) ?? EMPTY_CHAT_DRAFT;
    },
    subscribe(chatId, listener) {
      const chatListeners = listeners.get(chatId) ?? new Set<() => void>();
      chatListeners.add(listener);
      listeners.set(chatId, chatListeners);
      return () => {
        chatListeners.delete(listener);
        if (chatListeners.size === 0) {
          listeners.delete(chatId);
        }
      };
    },
    update(chatId, transition) {
      if (discarded.has(chatId)) return;
      const next = transition(drafts.get(chatId) ?? EMPTY_CHAT_DRAFT);
      if (isEmptyChatDraft(next)) {
        drafts.delete(chatId);
      } else {
        drafts.set(chatId, next);
      }
      notify(chatId);
    },
  };
}
