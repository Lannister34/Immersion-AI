import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router';

import { CharactersScreen } from '../../modules/characters';
import { HomeScreen } from '../../modules/chat-shell';
import { LorebooksScreen } from '../../modules/lorebooks';
import { ScenariosScreen } from '../../modules/scenarios';
import { ServerControlScreen } from '../../modules/server-control';
import { SettingsScreen } from '../../modules/settings';
import { CharacterEditorRouteComponent } from '../../routes/character-editor-route-component';
import { CharacterNewRouteComponent } from '../../routes/character-new-route-component';
import { ChatIndexRouteComponent } from '../../routes/chat-index-route-component';
import { ChatSessionRouteComponent } from '../../routes/chat-session-route-component';
import { LorebookEditorRouteComponent } from '../../routes/lorebook-editor-route-component';
import { LorebookNewRouteComponent } from '../../routes/lorebook-new-route-component';
import { NotFoundRouteComponent } from '../../routes/not-found-route-component';
import { RouteErrorComponent } from '../../routes/route-error-component';
import { ScenarioEditorRouteComponent } from '../../routes/scenario-editor-route-component';
import { ScenarioNewRouteComponent } from '../../routes/scenario-new-route-component';
import { RootLayout } from '../layout/root-layout';

interface AppRouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout,
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

function validateChatListSearch(search: Record<string, unknown>): ChatListSearch {
  const character = typeof search.character === 'string' ? search.character.trim() : '';

  return character.length > 0 ? { character } : {};
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
