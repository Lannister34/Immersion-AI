import { once } from 'node:events';
import http from 'node:http';

import { describe, expect, it, onTestFinished } from 'vitest';

import { requestOverSocket } from './socket-request.js';

interface ReceivedRequest {
  readonly method: string | undefined;
  readonly contentType: string | undefined;
  readonly body: string;
}

async function serve(handle: (request: http.IncomingMessage, response: http.ServerResponse) => void) {
  const server = http.createServer(handle);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  onTestFinished(async () => {
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test server is not listening on a TCP port.');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function serveEcho() {
  const received: ReceivedRequest[] = [];
  const origin = await serve((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      received.push({ body, contentType: request.headers['content-type'], method: request.method });
      response.writeHead(201, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Ответ сервера.');
    });
  });

  return { origin, received };
}

describe('requestOverSocket', () => {
  it('sends a GET without a body and resolves with the status and the body text', async () => {
    const { origin, received } = await serveEcho();

    await expect(requestOverSocket(`${origin}/health`)).resolves.toEqual({ body: 'Ответ сервера.', status: 201 });
    expect(received).toEqual([{ body: '', contentType: undefined, method: 'GET' }]);
  });

  it('sends a json option as a JSON body with its content type', async () => {
    const { origin, received } = await serveEcho();

    await requestOverSocket(`${origin}/v1/chat/completions`, { json: { текст: 'Привет.' }, method: 'POST' });

    expect(received).toEqual([{ body: '{"текст":"Привет."}', contentType: 'application/json', method: 'POST' }]);
  });

  it('sends the given headers beside its own, a Host other than the address it connects to included', async () => {
    const received: http.IncomingHttpHeaders[] = [];
    const origin = await serve((request, response) => {
      received.push(request.headers);
      response.end();
    });

    await requestOverSocket(`${origin}/api/runtime/stop`, {
      headers: { Host: '127.0.0.1:4787', 'User-Agent': 'Python-urllib/3.12' },
      json: {},
      method: 'POST',
    });

    expect(received).toEqual([
      expect.objectContaining({
        'content-type': 'application/json',
        host: '127.0.0.1:4787',
        'user-agent': 'Python-urllib/3.12',
      }),
    ]);
  });

  it('rejects when the connection closes before a response arrives', async () => {
    const origin = await serve((request) => request.socket.destroy());

    await expect(requestOverSocket(`${origin}/health`)).rejects.toThrow('socket hang up');
  });

  it('rejects when the connection closes in the middle of the body', async () => {
    const origin = await serve((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('data: первый\n\n', () => request.socket.destroy());
    });

    await expect(requestOverSocket(`${origin}/events`)).rejects.toThrow('aborted');
  });
});
