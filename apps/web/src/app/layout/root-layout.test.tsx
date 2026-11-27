import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NARROW_VIEWPORT_QUERY } from '../../shared/lib/media-queries';
import { mediaQueryStub } from '../../test-support/media-query-stub';
import { renderWithProviders } from '../../test-support/render-with-providers';
import { stubFetch } from '../../test-support/stub-fetch';
import { useMobileNavStore } from '../store/mobile-nav';
import { useUiShellStore } from '../store/ui-shell';
import { RootLayout } from './root-layout';
import { Topbar } from './topbar';

const MODEL_PATH = 'D:\\Модели\\mistral\\secondary.gguf';
const START_FAILURE = 'Process exited with code 1';

const FAILED_START: RuntimeOverviewResponse = {
  engine: { defaultModelsDir: 'D:\\Модели', executablePath: 'D:\\bin\\llama-server.exe', found: true },
  models: [],
  modelsDirsStatus: [],
  serverConfig: { contextSize: 8192, flashAttention: true, gpuLayers: 99, modelsDirs: [], port: 5001, threads: 0 },
  serverStatus: {
    error: START_FAILURE,
    launchConfig: null,
    model: 'secondary.gguf',
    modelPath: MODEL_PATH,
    pid: null,
    port: 5001,
    status: 'error',
  },
};

const SETTINGS: SettingsOverviewResponse = {
  profile: {
    messageFormatting: { actionsItalic: true, quotesHighlighted: true },
    responseLanguage: 'ru',
    streamingEnabled: true,
    systemPromptTemplate: '',
    thinkingEnabled: false,
    userName: 'Тестер',
    userPersona: '',
  },
  sampler: { activePresetId: 'default', modelBindingCount: 0, modelBindings: [], presets: [] },
};

const EMPTY_LIST = { items: [] };

const ANSWERS: Record<string, unknown> = {
  '/api/characters': EMPTY_LIST,
  '/api/chats': EMPTY_LIST,
  '/api/lorebooks': EMPTY_LIST,
  '/api/runtime/overview': FAILED_START,
  '/api/scenarios': EMPTY_LIST,
  '/api/settings/overview': SETTINGS,
};

describe('RootLayout', () => {
  it('shows a failed model start in the sidebar badge with its error', async () => {
    stubFetch().mockImplementation(async (input) => {
      const url = String(input);
      if (!(url in ANSWERS)) throw new Error(`The layout fake has no answer for ${url}.`);

      return new Response(JSON.stringify(ANSWERS[url]), { headers: { 'Content-Type': 'application/json' } });
    });

    await renderWithProviders(<RootLayout />);

    const badge = await screen.findByRole('link', { name: /Ошибка запуска/ });
    expect(badge.textContent).toContain(START_FAILURE);
  });
});

function answerLayoutQueries() {
  stubFetch().mockImplementation(async (input) => {
    const url = String(input);
    if (!(url in ANSWERS)) throw new Error(`The layout fake has no answer for ${url}.`);

    return new Response(JSON.stringify(ANSWERS[url]), { headers: { 'Content-Type': 'application/json' } });
  });
}

async function renderShell() {
  answerLayoutQueries();
  const rendered = await renderWithProviders(
    <>
      <RootLayout />
      <Topbar crumbs={[{ label: 'Чаты', strong: true }]} />
    </>,
  );
  const drawer = rendered.container.querySelector('aside.sb');
  if (!drawer) throw new Error('The sidebar did not render.');
  return { drawer, rendered };
}

describe('RootLayout navigation drawer', () => {
  afterEach(() => {
    useMobileNavStore.setState({ isOpen: false });
    useUiShellStore.setState({ chatRightPanelOpen: true });
  });

  it('opens from the topbar menu button with focus inside, and closes on Escape with focus back on the button', async () => {
    const { drawer } = await renderShell();
    const menuButton = screen.getByRole('button', { name: 'Открыть меню' });
    expect(drawer.getAttribute('data-mobile-open')).toBe('false');
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');

    menuButton.focus();
    fireEvent.click(menuButton);
    expect(drawer.getAttribute('data-mobile-open')).toBe('true');
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Закрыть меню' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer.getAttribute('data-mobile-open')).toBe('false');
    expect(document.activeElement).toBe(menuButton);
  });

  it('closes when the backdrop is tapped, and keeps the backdrop out of the accessibility tree', async () => {
    const { drawer, rendered } = await renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));

    const backdrop = rendered.container.querySelector('.sb-backdrop');
    if (!backdrop) throw new Error('The drawer backdrop did not render.');
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(backdrop);

    expect(drawer.getAttribute('data-mobile-open')).toBe('false');
  });

  it('closes after a navigation, also one it did not start itself, such as the browser back button', async () => {
    const { drawer, rendered } = await renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
    expect(drawer.getAttribute('data-mobile-open')).toBe('true');

    await rendered.router.navigate({ to: '/settings' });

    await waitFor(() => expect(drawer.getAttribute('data-mobile-open')).toBe('false'));
  });

  it('closes the chat sheet after a navigation on a phone', async () => {
    mediaQueryStub.matchOnly([NARROW_VIEWPORT_QUERY]);
    const { rendered } = await renderShell();
    useUiShellStore.setState({ chatRightPanelOpen: true });

    await rendered.router.navigate({ to: '/settings' });

    await waitFor(() => expect(useUiShellStore.getState().chatRightPanelOpen).toBe(false));
  });

  it('keeps the docked chat panel open after a navigation on a desktop', async () => {
    const { rendered } = await renderShell();
    useUiShellStore.setState({ chatRightPanelOpen: true });

    await rendered.router.navigate({ to: '/settings' });
    await waitFor(() => expect(rendered.router.state.location.pathname).toBe('/settings'));

    expect(useUiShellStore.getState().chatRightPanelOpen).toBe(true);
  });
});
