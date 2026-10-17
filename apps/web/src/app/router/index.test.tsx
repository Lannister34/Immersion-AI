import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { type AppRouter, createAppRouter } from '.';

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

vi.mock('../../modules/chats', async () => {
  const { useState } = await import('react');

  function ChatSessionScreen({ chatId }: ChatSessionScreenProps) {
    const [draft, setDraft] = useState('');

    return (
      <>
        <p>{`chat session:${chatId}`}</p>
        <input
          aria-label={`draft of ${chatId}`}
          onChange={(event) => setDraft(event.currentTarget.value)}
          value={draft}
        />
      </>
    );
  }

  return {
    ChatListScreen: ({ characterFilter }: ChatListScreenProps) => <p>{`chat list:${String(characterFilter)}`}</p>,
    ChatSessionScreen,
  };
});

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

interface LoadedApp {
  app: ReactElement;
  router: AppRouter;
}

async function loadAppAt(url: string): Promise<LoadedApp> {
  const queryClient = new QueryClient();
  const router = createAppRouter(queryClient);
  router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [url] }) });
  await router.load();

  return {
    app: (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    ),
    router,
  };
}

async function renderAt(url: string): Promise<string> {
  const { app } = await loadAppAt(url);

  return renderToString(app);
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

  it('mounts a new chat screen for each chat id, so a draft typed in one chat is gone in the next', async () => {
    const firstChatId = '7f9c1d2e-0000-4000-8000-000000000001';
    const branchChatId = '7f9c1d2e-0000-4000-8000-000000000002';
    const { app, router } = await loadAppAt(`/chat/${firstChatId}`);
    render(app);
    const firstDraft = await screen.findByRole('textbox', { name: `draft of ${firstChatId}` });
    fireEvent.change(firstDraft, { target: { value: 'черновик' } });
    expect(firstDraft).toHaveProperty('value', 'черновик');

    await act(() => router.navigate({ to: '/chat/$chatId', params: { chatId: branchChatId } }));

    const branchDraft = await screen.findByRole('textbox', { name: `draft of ${branchChatId}` });
    expect(branchDraft).toHaveProperty('value', '');
  });
});
