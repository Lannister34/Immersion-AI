import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';

import { CharactersScreen } from '../../modules/characters';
import { HomeScreen } from '../../modules/chat-shell';
import { ChatListScreen, ChatSessionScreen } from '../../modules/chats';
import { LorebooksScreen } from '../../modules/lorebooks';
import { ScenariosScreen } from '../../modules/scenarios';
import { ServerControlScreen } from '../../modules/server-control';
import { SettingsScreen } from '../../modules/settings';
import { RouteStatusScreen } from '../../shared/ui/route-status-screen';
import { RootLayout } from '../layout/root-layout';

interface AppRouterContext {
  queryClient: QueryClient;
}

function RootRouteComponent() {
  return <RootLayout />;
}

function NotFoundRouteComponent() {
  return (
    <RouteStatusScreen
      description="Проверьте адрес или вернитесь в доступные разделы приложения."
      eyebrow="маршрут"
      title="Страница не найдена"
    />
  );
}

function RouteErrorComponent() {
  return (
    <RouteStatusScreen
      description="Во время загрузки страницы произошла ошибка. Обновите экран и попробуйте снова."
      eyebrow="ошибка"
      title="Не удалось открыть раздел"
    />
  );
}

function ChatSessionRouteComponent() {
  const { chatId } = chatSessionRoute.useParams();

  return <ChatSessionScreen chatId={chatId} />;
}

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: RootRouteComponent,
  errorComponent: RouteErrorComponent,
  notFoundComponent: NotFoundRouteComponent,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeScreen,
});

const chatIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: ChatListScreen,
});

const chatSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat/$chatId',
  component: ChatSessionRouteComponent,
});

const charactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters',
  component: CharactersScreen,
});

const scenariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scenarios',
  component: ScenariosScreen,
});

const lorebooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lorebooks',
  component: LorebooksScreen,
});

const serverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/server',
  component: ServerControlScreen,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsScreen,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  chatIndexRoute,
  chatSessionRoute,
  charactersRoute,
  scenariosRoute,
  lorebooksRoute,
  serverRoute,
  settingsRoute,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: {
      queryClient,
    },
    defaultPreload: 'intent',
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}

interface AppRouterProviderProps {
  router: AppRouter;
}

export function AppRouterProvider({ router }: AppRouterProviderProps) {
  return <RouterProvider router={router} />;
}
