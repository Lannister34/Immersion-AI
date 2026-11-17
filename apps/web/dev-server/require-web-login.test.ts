import { EventEmitter } from 'node:events';
import type { PreviewServer, ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';

import { requireWebLogin } from './require-web-login.js';

function installInto(server: 'dev' | 'preview', password: string | null) {
  const httpServer = new EventEmitter();
  const middlewares = { use: vi.fn() };
  const plugin = requireWebLogin({ password });
  const hook = server === 'dev' ? plugin.configureServer : plugin.configurePreviewServer;

  if (typeof hook !== 'function') {
    throw new Error(`The plugin has no ${server} server hook`);
  }

  const viteUpgradeHandler = (): void => undefined;
  httpServer.on('upgrade', viteUpgradeHandler);
  hook.call({} as never, { httpServer, middlewares } as unknown as ViteDevServer & PreviewServer);

  return {
    middlewareCount: middlewares.use.mock.calls.length,
    upgradeListeners: httpServer.listeners('upgrade'),
    viteUpgradeHandler,
  };
}

describe('requireWebLogin', () => {
  it('runs before the other plugins', () => {
    expect(requireWebLogin({ password: '4821' }).enforce).toBe('pre');
  });

  it('guards the dev and preview servers when a password is set, ahead of any websocket upgrade handler', () => {
    for (const server of ['dev', 'preview'] as const) {
      const installed = installInto(server, '4821');

      expect(installed.middlewareCount).toBe(1);
      expect(installed.upgradeListeners).toHaveLength(2);
      expect(installed.upgradeListeners[1]).toBe(installed.viteUpgradeHandler);
    }
  });

  it('installs nothing without a password, as a fresh clone runs', () => {
    expect(installInto('dev', null)).toMatchObject({ middlewareCount: 0 });
    expect(installInto('dev', null).upgradeListeners).toHaveLength(1);
  });
});
