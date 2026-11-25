import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createContext, type JSXElementConstructor, type ReactNode, useContext } from 'react';

import { type ChatDraftStore, ChatDraftStoreContext, createChatDraftStore } from '../modules/chats';
import { createEditorDraftStore, type EditorDraftStore } from '../shared/drafts/editor-draft-store';
import { EditorDraftStoreContext } from '../shared/drafts/editor-draft-store-context';
import { createTestQueryClient } from './create-test-query-client';

export interface TestProvidersOptions {
  chatDraftStore?: ChatDraftStore;
  editorDraftStore?: EditorDraftStore;
  queryClient?: QueryClient;
  initialPath?: string;
}

export interface TestProviders {
  chatDraftStore: ChatDraftStore;
  editorDraftStore: EditorDraftStore;
  queryClient: QueryClient;
  router: AnyRouter;
  wrapper: JSXElementConstructor<{ children: ReactNode }>;
}

export async function createTestProviders({
  chatDraftStore = createChatDraftStore(),
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
        <ChatDraftStoreContext value={chatDraftStore}>
          <RoutedChildren.Provider value={children}>
            <RouterProvider router={router} />
          </RoutedChildren.Provider>
        </ChatDraftStoreContext>
      </EditorDraftStoreContext>
    </QueryClientProvider>
  );

  return { chatDraftStore, editorDraftStore, queryClient, router, wrapper };
}
