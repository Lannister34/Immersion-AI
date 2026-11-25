import { createContext } from 'react';

import type { ChatDraftStore } from './chat-draft-store';

export const ChatDraftStoreContext = createContext<ChatDraftStore | null>(null);
