import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';

import { CharacterEditorScreen, CharactersScreen } from '../../modules/characters';
import { HomeScreen } from '../../modules/chat-shell';
import { ChatListScreen, ChatSessionScreen } from '../../modules/chats';
import { LorebookEditorScreen, LorebooksScreen } from '../../modules/lorebooks';
import { ScenarioEditorScreen, ScenariosScreen } from '../../modules/scenarios';
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

interface ChatListSearch {
  character?: string;
}

// Фильтр по персонажу живёт в URL: ссылка из библиотеки персонажей
// переживает перезагрузку и делится как обычная ссылка.
function validateChatListSearch(search: Record<string, unknown>): ChatListSearch {
  const character = typeof search.character === 'string' ? search.character.trim() : '';

  return character.length > 0 ? { character } : {};
}

function ChatIndexRouteComponent() {
  const { character } = chatIndexRoute.useSearch();

  return <ChatListScreen characterFilter={character ?? null} />;
}

const chatIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: ChatIndexRouteComponent,
  validateSearch: validateChatListSearch,
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

function CharacterNewRouteComponent() {
  return <CharacterEditorScreen characterId={null} />;
}

function CharacterEditorRouteComponent() {
  const { characterId } = characterEditorRoute.useParams();
  return <CharacterEditorScreen characterId={characterId} />;
}

const characterNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters/new',
  component: CharacterNewRouteComponent,
});

const characterEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters/$characterId',
  component: CharacterEditorRouteComponent,
});

const scenariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scenarios',
  component: ScenariosScreen,
});

function ScenarioNewRouteComponent() {
  return <ScenarioEditorScreen scenarioId={null} />;
}

function ScenarioEditorRouteComponent() {
  const { scenarioId } = scenarioEditorRoute.useParams();
  return <ScenarioEditorScreen scenarioId={scenarioId} />;
}

const scenarioNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scenarios/new',
  component: ScenarioNewRouteComponent,
});

const scenarioEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scenarios/$scenarioId',
  component: ScenarioEditorRouteComponent,
});

const lorebooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lorebooks',
  component: LorebooksScreen,
});

function LorebookNewRouteComponent() {
  return <LorebookEditorScreen lorebookId={null} />;
}

function LorebookEditorRouteComponent() {
  const { lorebookId } = lorebookEditorRoute.useParams();
  return <LorebookEditorScreen lorebookId={lorebookId} />;
}

const lorebookNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lorebooks/new',
  component: LorebookNewRouteComponent,
});

const lorebookEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lorebooks/$lorebookId',
  component: LorebookEditorRouteComponent,
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
  characterNewRoute,
  characterEditorRoute,
  scenariosRoute,
  scenarioNewRoute,
  scenarioEditorRoute,
  lorebooksRoute,
  lorebookNewRoute,
  lorebookEditorRoute,
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
