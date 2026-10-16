import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingHttpHeaders, request, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { createServer, type InlineConfig, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

const LOOPBACK = '127.0.0.1';
const UPSTREAM_MARKER = 'dev-server-boundary-upstream';
const FOREIGN_ORIGIN = 'http://localhost:9999';
const WORKSPACE_MANIFEST_MARKER = '"packageManager"';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));

function workspaceFile(...segments: string[]): string {
  return join(workspaceRoot, ...segments);
}

function fsUrl(file: string): string {
  return `/@fs${pathToFileURL(file).pathname}`;
}

function portOf(server: { address(): AddressInfo | string | null } | null): number {
  const address = server?.address();

  if (!address || typeof address === 'string') {
    throw new Error('The server is not listening on a TCP port');
  }

  return address.port;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => resolve(portOf(server)));
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function send(port: number, path: string, method = 'GET', headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: LOOPBACK, port, path, method, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () =>
        resolve({
          status: incoming.statusCode ?? 0,
          headers: incoming.headers,
          body: Buffer.concat(chunks).toString(),
        }),
      );
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function devServerConfig(cacheDir: string, port: number, upstreamOrigin: string): InlineConfig {
  return {
    configFile,
    root: webRoot,
    cacheDir,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      port,
      hmr: false,
      ws: false,
      watch: null,
      proxy: { '/api': { target: upstreamOrigin } },
    },
  };
}

describe('the dev server that vite.config.ts configures', () => {
  let cacheDir: string;
  let upstream: Server;
  let upstreamOrigin: string;
  let devServer: ViteDevServer;
  let port: number;

  beforeAll(async () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'immersion-web-dev-server-'));
    upstream = createHttpServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { 'x-upstream': UPSTREAM_MARKER });
      outgoing.end('{}');
    });
    upstreamOrigin = `http://${LOOPBACK}:${await listen(upstream)}`;

    devServer = await createServer(devServerConfig(cacheDir, 0, upstreamOrigin));
    await devServer.listen();
    port = portOf(devServer.httpServer);
  }, 60_000);

  afterAll(async () => {
    await devServer?.close();
    if (upstream?.listening) {
      await close(upstream);
    }
    if (cacheDir) {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('listens on the IPv4 loopback address alone, not on every interface or wherever localhost resolves', () => {
    expect(devServer.httpServer?.address()).toMatchObject({ address: LOOPBACK, family: 'IPv4' });
  });

  describe('file access', () => {
    it('serves the app shell and the web sources', async () => {
      expect((await send(port, '/')).status).toBe(200);
      expect((await send(port, '/src/main.tsx')).status).toBe(200);
    });

    it('serves the contracts source that the app imports through its alias', async () => {
      const reply = await send(port, fsUrl(workspaceFile('packages', 'contracts', 'src', 'index.ts')));

      expect(reply.status).toBe(200);
    });

    it('serves a dependency from the workspace node_modules, where pnpm keeps its real path', async () => {
      const linked = createRequire(new URL('../package.json', import.meta.url)).resolve('react');
      const real = realpathSync(linked);

      expect(real.startsWith(workspaceFile('node_modules'))).toBe(true);
      expect((await send(port, fsUrl(real))).status).toBe(200);
    });

    it('refuses /@fs reads of workspace files outside the web app that the workspace-root default allowed', async () => {
      const outside = [
        workspaceFile('package.json'),
        workspaceFile('apps', 'api', 'package.json'),
        workspaceFile('apps', 'api', 'src', 'server.ts'),
        workspaceFile('packages', 'domain', 'package.json'),
        workspaceFile('packages', 'contracts', 'package.json'),
      ];

      for (const file of outside) {
        for (const query of ['', '?raw', '?import', '?url']) {
          expect(`${(await send(port, `${fsUrl(file)}${query}`)).status} ${file}${query}`).toBe(`403 ${file}${query}`);
        }
      }
    });

    it('refuses a /@fs path that climbs out of an allowed directory', async () => {
      const climbing = `${fsUrl(join(webRoot, 'src'))}/../../../package.json`;

      expect((await send(port, climbing)).status).toBe(403);
    });

    it('serves no workspace file outside the web app through an encoded or root-relative climb', async () => {
      for (const path of [
        `${fsUrl(join(webRoot, 'src'))}/..%2F..%2F..%2Fpackage.json`,
        `${fsUrl(join(webRoot, 'src'))}/%2E%2E/%2E%2E/%2E%2E/package.json`,
        '/../../package.json',
        '/..%2F..%2Fpackage.json',
      ]) {
        const reply = await send(port, path);

        expect(`${path} ${reply.body.includes(WORKSPACE_MANIFEST_MARKER)}`).toBe(`${path} false`);
      }
    });
  });

  describe('cross-origin access', () => {
    it('grants no other local origin read access to proxied API responses', async () => {
      const reply = await send(port, '/api/runtime/overview', 'GET', { Origin: FOREIGN_ORIGIN });

      expect(reply.headers['x-upstream']).toBe(UPSTREAM_MARKER);
      expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('answers no CORS preflight itself, so a foreign page gets no permission to send', async () => {
      const reply = await send(port, '/api/chats', 'OPTIONS', {
        Origin: FOREIGN_ORIGIN,
        'Access-Control-Request-Method': 'POST',
      });

      expect(reply.headers['x-upstream']).toBe(UPSTREAM_MARKER);
      expect(reply.headers['access-control-allow-origin']).toBeUndefined();
      expect(reply.headers['access-control-allow-methods']).toBeUndefined();
    });

    it('grants no other local origin read access to the web sources', async () => {
      const reply = await send(port, '/src/main.tsx', 'GET', { Origin: FOREIGN_ORIGIN });

      expect(reply.status).toBe(200);
      expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('editor launch', () => {
    const launch = '/__open-in-editor?file=no-such-file.txt';

    it('refuses an editor launch from another site, another local port or a client that names no site', async () => {
      for (const site of ['cross-site', 'same-site', 'none', undefined]) {
        const reply = await send(port, launch, 'GET', site === undefined ? {} : { 'Sec-Fetch-Site': site });

        expect(`${reply.status} ${site}`).toBe(`403 ${site}`);
        expect(reply.body).toBe('');
      }
    });

    it('refuses the launch whatever the case of the path', async () => {
      const reply = await send(port, '/__Open-In-Editor?file=no-such-file.txt', 'GET', {
        'Sec-Fetch-Site': 'cross-site',
      });

      expect(reply.status).toBe(403);
    });

    it('still lets the error overlay on its own origin open files in the editor', async () => {
      const reply = await send(port, launch, 'GET', { 'Sec-Fetch-Site': 'same-origin' });

      expect(reply.status).toBe(200);
    });
  });

  it('refuses to start, rather than move to the next port, when its port is taken', async () => {
    const occupant = createHttpServer();
    const taken = await listen(occupant);
    const contender = await createServer(devServerConfig(cacheDir, taken, upstreamOrigin));

    try {
      await expect(contender.listen()).rejects.toThrow(`Port ${taken} is already in use`);
    } finally {
      await contender.close();
      await close(occupant);
    }
  }, 60_000);
});
