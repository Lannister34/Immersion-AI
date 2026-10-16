import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { createContext, type JSXElementConstructor, type ReactNode, useContext } from 'react';

import { createTestQueryClient } from './create-test-query-client';

export interface TestProvidersOptions {
  queryClient?: QueryClient;
  initialPath?: string;
}

export interface TestProviders {
  queryClient: QueryClient;
  router: AnyRouter;
  wrapper: JSXElementConstructor<{ children: ReactNode }>;
}

export async function createTestProviders({
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
      <RoutedChildren.Provider value={children}>
        <RouterProvider router={router} />
      </RoutedChildren.Provider>
    </QueryClientProvider>
  );

  return { queryClient, router, wrapper };
}
