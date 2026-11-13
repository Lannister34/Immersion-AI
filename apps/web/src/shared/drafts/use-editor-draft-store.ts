import { useContext } from 'react';

import type { EditorDraftStore } from './editor-draft-store';
import { EditorDraftStoreContext } from './editor-draft-store-context';

export function useEditorDraftStore(): EditorDraftStore {
  const store = useContext(EditorDraftStoreContext);
  if (!store) {
    throw new Error('useEditorDraftStore needs an EditorDraftStoreContext provider.');
  }
  return store;
}
