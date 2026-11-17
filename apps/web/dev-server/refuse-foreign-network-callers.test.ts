import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import type { PreviewServer, ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';

import { refuseForeignNetworkCallers } from './refuse-foreign-network-callers.js';

function connectFrom(remoteAddress: string, server: 'dev' | 'preview' = 'dev'): { destroyed: boolean } {
  const httpServer = new EventEmitter();
  const plugin = refuseForeignNetworkCallers();
  const hook = server === 'dev' ? plugin.configureServer : plugin.configurePreviewServer;

  if (typeof hook !== 'function') {
    throw new Error(`The plugin has no ${server} server hook`);
  }

  hook.call({} as never, { httpServer } as unknown as ViteDevServer & PreviewServer);

  const destroy = vi.fn();
  httpServer.emit('connection', { destroy, remoteAddress } as unknown as Socket);

  return { destroyed: destroy.mock.calls.length > 0 };
}

describe('refuseForeignNetworkCallers', () => {
  it('keeps connections from this computer and the local network', () => {
    expect(connectFrom('127.0.0.1').destroyed).toBe(false);
    expect(connectFrom('192.168.31.20').destroyed).toBe(false);
  });

  it('drops a connection from outside the local network before it sends a request', () => {
    expect(connectFrom('203.0.113.7').destroyed).toBe(true);
  });

  it('guards vite preview too, which takes the same host and proxy from the config', () => {
    expect(connectFrom('203.0.113.7', 'preview').destroyed).toBe(true);
    expect(connectFrom('192.168.31.20', 'preview').destroyed).toBe(false);
  });
});
