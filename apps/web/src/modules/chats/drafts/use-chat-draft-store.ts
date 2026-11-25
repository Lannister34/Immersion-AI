import { useContext } from 'react';

import type { ChatDraftStore } from './chat-draft-store';
import { ChatDraftStoreContext } from './chat-draft-store-context';

export function useChatDraftStore(): ChatDraftStore {
  const store = useContext(ChatDraftStoreContext);
  if (!store) {
    throw new Error('useChatDraftStore needs a ChatDraftStoreContext provider.');
  }
  return store;
}
