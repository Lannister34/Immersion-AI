import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createContext, type JSXElementConstructor, type ReactNode, useContext } from 'react';

import { createEditorDraftStore, type EditorDraftStore } from '../shared/drafts/editor-draft-store';
import { EditorDraftStoreContext } from '../shared/drafts/editor-draft-store-context';
import { createTestQueryClient } from './create-test-query-client';

export interface TestProvidersOptions {
  editorDraftStore?: EditorDraftStore;
  queryClient?: QueryClient;
  initialPath?: string;
}

export interface TestProviders {
  editorDraftStore: EditorDraftStore;
  queryClient: QueryClient;
  router: AnyRouter;
  wrapper: JSXElementConstructor<{ children: ReactNode }>;
}

export async function createTestProviders({
  editorDraftStore = createEditorDraftStore(),
  queryClient = createTestQueryClient(),
  initialPath = '/',
}: TestProvidersOptions = {}): Promise<TestProviders> {
  const RoutedChildren = createContext<ReactNode>(null);
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    routeTree: createRootRoute({ component: () => useContext(RoutedChildren) }),
  });
  await router.load();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <EditorDraftStoreContext value={editorDraftStore}>
        <RoutedChildren.Provider value={children}>
          <RouterProvider router={router} />
        </RoutedChildren.Provider>
      </EditorDraftStoreContext>
    </QueryClientProvider>
  );

  return { editorDraftStore, queryClient, router, wrapper };
}
