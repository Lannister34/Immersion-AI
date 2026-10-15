import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';

import { describe, expect, it, onTestFinished } from 'vitest';

import { ForeignConnectionError, installForeignConnectionGuard } from './foreign-connection-guard.js';

function useGuard() {
  const guard = installForeignConnectionGuard();
  onTestFinished(() => guard.uninstall());

  return guard;
}

async function listenOnLoopback(server: http.Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  if (typeof address !== 'object' || address === null) {
    throw new Error('The test server has no TCP address.');
  }

  return address.port;
}

async function closeServer(server: http.Server) {
  server.closeAllConnections();
  server.close();
  await once(server, 'close');
}

function connectWithUntypedArguments(...args: unknown[]): net.Socket {
  const socket = new net.Socket();
  Reflect.apply(socket.connect, socket, args);

  return socket;
}

async function portOfClosedServer() {
  const server = http.createServer();
  const port = await listenOnLoopback(server);
  await closeServer(server);

  return port;
}

async function localSocketPath() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-guard-'));
  onTestFinished(() => fs.rm(directory, { force: true, recursive: true }));

  return process.platform === 'win32'
    ? `\\\\.\\pipe\\${path.basename(directory)}`
    : path.join(directory, 'server.sock');
}

describe('foreign connection guard', () => {
  it('refuses a fetch to a port no server in this process listens on, since built-in fetch connects through net.Socket', async () => {
    const guard = useGuard();
    const port = await portOfClosedServer();

    await expect(fetch(`http://127.0.0.1:${port}/props`)).rejects.toMatchObject({
      cause: expect.any(ForeignConnectionError),
    });
    expect(() => guard.assertNoneRefused()).toThrow(`127.0.0.1:${port}`);
  });

  it('refuses a node:http request the same way, whatever client the code under test uses', async () => {
    const guard = useGuard();
    const port = await portOfClosedServer();
    const request = http.get(`http://127.0.0.1:${port}/health`);

    const [failure] = await once(request, 'error');

    expect(failure).toBeInstanceOf(ForeignConnectionError);
    expect(() => guard.assertNoneRefused()).toThrow(`127.0.0.1:${port}`);
  });

  it('refuses a TLS connection to an outside host, so a cloud provider call cannot leave the test either', async () => {
    const guard = useGuard();

    await expect(fetch('https://cloud-provider.invalid/v1/models')).rejects.toMatchObject({
      cause: expect.any(ForeignConnectionError),
    });
    expect(() => guard.assertNoneRefused()).toThrow('cloud-provider.invalid:443');
  });

  it('refuses a positional connect whose port is a padded string, which Node still reads as a TCP port', async () => {
    const guard = useGuard();
    const socket = connectWithUntypedArguments(' 443 ', 'cloud-provider.invalid');

    const [failure] = await once(socket, 'error');

    expect(failure).toBeInstanceOf(ForeignConnectionError);
    expect(() => guard.assertNoneRefused()).toThrow('cloud-provider.invalid:443');
  });

  it('lets a host-less positional connect reach a server the test started: Node dials localhost and reads a padded digit string as a port, not a pipe path', async () => {
    const guard = useGuard();
    const server = http.createServer();
    const port = await listenOnLoopback(server);
    onTestFinished(() => closeServer(server));
    const socket = connectWithUntypedArguments(` ${port} `);

    await once(socket, 'connect');
    socket.destroy();

    expect(() => guard.assertNoneRefused()).not.toThrow();
  });

  it('lets a test reach a server it started itself', async () => {
    const guard = useGuard();
    const server = http.createServer((_request, response) => response.end('own server'));
    const port = await listenOnLoopback(server);
    onTestFinished(() => closeServer(server));

    const response = await fetch(`http://127.0.0.1:${port}/`);

    expect(await response.text()).toBe('own server');
    expect(() => guard.assertNoneRefused()).not.toThrow();
  });

  it('lets a node:http request over a socketPath reach the pipe server the test started, though node:http also hands Socket#connect port 80', async () => {
    const guard = useGuard();
    const socketPath = await localSocketPath();
    const server = http.createServer((_request, response) => response.end('own pipe server'));
    server.listen(socketPath);
    await once(server, 'listening');
    onTestFinished(() => closeServer(server));

    const [response] = await once(http.get({ path: '/', socketPath }), 'response');

    expect(await text(response)).toBe('own pipe server');
    expect(() => guard.assertNoneRefused()).not.toThrow();
  });
});
