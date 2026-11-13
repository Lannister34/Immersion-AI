import { createContext } from 'react';

import type { EditorDraftStore } from './editor-draft-store';

export const EditorDraftStoreContext = createContext<EditorDraftStore | null>(null);
