import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '.';

interface ChatListScreenProps {
  characterFilter: string | null;
}

interface ChatSessionScreenProps {
  chatId: string;
}

interface CharacterEditorScreenProps {
  characterId: string | null;
}

interface ScenarioEditorScreenProps {
  scenarioId: string | null;
}

interface LorebookEditorScreenProps {
  lorebookId: string | null;
}

vi.mock('../layout/root-layout', async () => {
  const { Outlet } = await import('@tanstack/react-router');
  return { RootLayout: () => <Outlet /> };
});

vi.mock('../../modules/chat-shell', () => ({ HomeScreen: () => <p>home</p> }));

vi.mock('../../modules/chats', () => ({
  ChatListScreen: ({ characterFilter }: ChatListScreenProps) => <p>{`chat list:${String(characterFilter)}`}</p>,
  ChatSessionScreen: ({ chatId }: ChatSessionScreenProps) => <p>{`chat session:${chatId}`}</p>,
}));

vi.mock('../../modules/characters', () => ({
  CharactersScreen: () => <p>characters</p>,
  CharacterEditorScreen: ({ characterId }: CharacterEditorScreenProps) => (
    <p>{`character editor:${String(characterId)}`}</p>
  ),
}));

vi.mock('../../modules/scenarios', () => ({
  ScenariosScreen: () => <p>scenarios</p>,
  ScenarioEditorScreen: ({ scenarioId }: ScenarioEditorScreenProps) => <p>{`scenario editor:${String(scenarioId)}`}</p>,
}));

vi.mock('../../modules/lorebooks', () => ({
  LorebooksScreen: () => <p>lorebooks</p>,
  LorebookEditorScreen: ({ lorebookId }: LorebookEditorScreenProps) => <p>{`lorebook editor:${String(lorebookId)}`}</p>,
}));

vi.mock('../../modules/server-control', () => ({ ServerControlScreen: () => <p>server</p> }));

vi.mock('../../modules/settings', () => ({ SettingsScreen: () => <p>settings</p> }));

async function renderAt(url: string): Promise<string> {
  const queryClient = new QueryClient();
  const router = createAppRouter(queryClient);
  router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [url] }) });
  await router.load();

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('app router', () => {
  it.each([
    ['/chat/7f9c1d2e-0000-4000-8000-000000000001', 'chat session:7f9c1d2e-0000-4000-8000-000000000001'],
    ['/characters/new', 'character editor:null'],
    ['/characters/aria-card', 'character editor:aria-card'],
    ['/scenarios/new', 'scenario editor:null'],
    ['/scenarios/harbour-night', 'scenario editor:harbour-night'],
    ['/lorebooks/new', 'lorebook editor:null'],
    ['/lorebooks/meander-studio', 'lorebook editor:meander-studio'],
  ])('a code-based route has its path as its id, so getRouteApi of %s renders %s', async (url, expected) => {
    expect(await renderAt(url)).toContain(expected);
  });

  it('hands the chat list search to the screen through the route api of /chat', async () => {
    expect(await renderAt(`/chat?character=${encodeURIComponent('Мария')}`)).toContain('chat list:Мария');
    expect(await renderAt('/chat')).toContain('chat list:null');
  });

  it('renders the not-found screen for an unknown path', async () => {
    expect(await renderAt('/missing-route')).toContain('Страница не найдена');
  });
});
