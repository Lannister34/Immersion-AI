import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useLocation,
} from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { stubFetch } from './stub-fetch';
import { UnarrangedFetchError } from './unarranged-fetch-guard';

type JsdomErrorListener = (error: Error) => void;

interface JsdomVirtualConsole {
  on(event: 'jsdomError', listener: JsdomErrorListener): void;
  off(event: 'jsdomError', listener: JsdomErrorListener): void;
}

async function loadDomFetchGuard() {
  const { domFetchGuard } = await import('./dom-fetch-guard');

  return domFetchGuard;
}

function isJsdomVirtualConsole(value: unknown): value is JsdomVirtualConsole {
  return (
    typeof value === 'object' &&
    value !== null &&
    'on' in value &&
    typeof value.on === 'function' &&
    'off' in value &&
    typeof value.off === 'function'
  );
}

function collectJsdomReports(): string[] {
  const environment: unknown = Reflect.get(globalThis, 'jsdom');
  const virtualConsole: unknown =
    typeof environment === 'object' && environment !== null ? Reflect.get(environment, 'virtualConsole') : undefined;

  if (!isJsdomVirtualConsole(virtualConsole)) {
    throw new Error('The dom project runs without the jsdom virtual console.');
  }

  const reports: string[] = [];
  const collect: JsdomErrorListener = (error) => {
    reports.push(error.message);
  };
  virtualConsole.on('jsdomError', collect);
  onTestFinished(() => {
    virtualConsole.off('jsdomError', collect);
  });

  return reports;
}

function LocationName() {
  const pathname = useLocation({ select: (location) => location.pathname });

  return <p>{`at ${pathname}`}</p>;
}

describe('the dom setup', () => {
  it('has the fetch guard in place before a test file imports anything of it', async () => {
    await expect(fetch('/api/characters')).rejects.toEqual(new UnarrangedFetchError('/api/characters'));

    const domFetchGuard = await loadDomFetchGuard();
    expect(() => domFetchGuard.assertNoneRefused()).toThrow(/fetched \/api\/characters without a stub/);
  });

  it('fails a test after it fetched without a stub, even when the code swallowed the rejection', async () => {
    const domFetchGuard = await loadDomFetchGuard();
    const assertNoneRefused = domFetchGuard.assertNoneRefused;
    const verdicts: string[] = [];
    const spy = vi.spyOn(domFetchGuard, 'assertNoneRefused').mockImplementation(() => {
      try {
        assertNoneRefused();
        verdicts.push('none refused');
      } catch (error) {
        verdicts.push(error instanceof Error ? error.message : String(error));
      }
    });
    onTestFinished(() => {
      spy.mockRestore();
      expect(verdicts).toEqual([expect.stringContaining('fetched /api/chats without a stub')]);
    });

    await fetch('/api/chats').catch(() => undefined);
  });

  it('lets a fetch a test stubbed through test support answer', async () => {
    const stub = stubFetch().mockResolvedValue(new Response('{"ok":true}'));

    const response = await fetch('/api/settings');

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(stub).toHaveBeenCalledWith('/api/settings');
  });

  it('replaces the scrollTo that jsdom only reports as not implemented with one that does nothing', () => {
    const reports = collectJsdomReports();

    expect(window.scrollTo(0, 240)).toBeUndefined();
    expect(window.scrollTo({ top: 240, left: 80 })).toBeUndefined();

    expect([window.scrollX, window.scrollY]).toEqual([0, 0]);
    expect(reports).toEqual([]);
  });

  it('lets a test navigate a router, which scrolls the window after each route it renders, without a stub', async () => {
    const reports = collectJsdomReports();
    const rootRoute = createRootRoute();
    const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$page', component: LocationName });
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/first'] }),
      routeTree: rootRoute.addChildren([pageRoute]),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    await screen.findByText('at /first');

    act(() => router.history.push('/second'));

    expect(await screen.findByText('at /second')).toBeDefined();
    expect(reports).toEqual([]);
  });
});
