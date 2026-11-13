import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';

import { createEditorDraftStore } from '../../shared/drafts/editor-draft-store';
import { EditorDraftStoreContext } from '../../shared/drafts/editor-draft-store-context';
import { createAppQueryClient } from '../query-client';
import { createAppRouter } from '../router';

export function AppProviders() {
  const [queryClient] = useState(createAppQueryClient);
  const [router] = useState(() => createAppRouter(queryClient));
  const [editorDraftStore] = useState(createEditorDraftStore);

  return (
    <QueryClientProvider client={queryClient}>
      <EditorDraftStoreContext value={editorDraftStore}>
        <RouterProvider router={router} />
      </EditorDraftStoreContext>
    </QueryClientProvider>
  );
}
