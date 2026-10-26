import { once } from 'node:events';
import http from 'node:http';

import { describe, expect, it, onTestFinished } from 'vitest';

import { createCapturingLogger } from '../../test-support/capturing-logger.js';
import { CLIENT_DISCONNECT_LOG_MESSAGE } from '../../test-support/client-disconnect-outcome.js';
import { createDeferred } from '../../test-support/deferred.js';
import { openSocketRequest } from '../../test-support/open-socket-request.js';
import { clientDisconnectSignal, handledAsClientDisconnect } from './client-disconnect-signal.js';

interface BodyReadExchange {
  readonly events: readonly string[];
  readonly response: http.ServerResponse;
  readonly responseClosed: Promise<void>;
}

interface BodyReadServer {
  readonly origin: string;
  readonly exchange: Promise<BodyReadExchange>;
}

async function serveOneBodyRead(): Promise<BodyReadServer> {
  const exchange = createDeferred<BodyReadExchange>();
  const server = http.createServer((request, response) => {
    const events: string[] = [];
    const responseClosed = new Promise<void>((resolve) => {
      response.once('close', () => {
        events.push('response close');
        resolve();
      });
    });

    request.on('aborted', () => events.push('request aborted'));
    request.on('close', () => events.push('request close'));
    request.once('close', () => exchange.resolve({ events, response, responseClosed }));
    request.resume();
  });

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

  return { origin: `http://127.0.0.1:${address.port}`, exchange: exchange.promise };
}

describe('node:http once a POST body is read', () => {
  it("emits 'close' on the request while the client is still connected", async () => {
    const { origin, exchange } = await serveOneBodyRead();
    const client = openSocketRequest(origin, { prompt: 'Привет.' });
    const { events } = await exchange;
    const eventsWhileConnected = [...events];

    await client.disconnect();

    expect(eventsWhileConnected).toEqual(['request close']);
  });

  it("never emits 'aborted' on the request when the client disconnects: only the unended response emits 'close'", async () => {
    const { origin, exchange } = await serveOneBodyRead();
    const client = openSocketRequest(origin, { prompt: 'Привет.' });
    const { events, response, responseClosed } = await exchange;

    await client.disconnect();
    await responseClosed;

    expect(events).toEqual(['request close', 'response close']);
    expect(response.writableEnded).toBe(false);
  });
});

describe('clientDisconnectSignal', () => {
  it('aborts when the client disconnects before the response ends', async () => {
    const { origin, exchange } = await serveOneBodyRead();
    const client = openSocketRequest(origin, { prompt: 'Привет.' });
    const { response } = await exchange;
    const signal = clientDisconnectSignal(response);
    const aborted = once(signal, 'abort');

    expect(signal.aborted).toBe(false);

    await client.disconnect();
    await aborted;

    expect(signal.reason).toMatchObject({ name: 'AbortError' });
  });

  it('stays unaborted, and leaves no close listener behind, when the response ends before the client leaves', async () => {
    const { origin, exchange } = await serveOneBodyRead();
    const client = openSocketRequest(origin, { prompt: 'Привет.' });
    const { response, responseClosed } = await exchange;
    const signal = clientDisconnectSignal(response);

    response.end('Готово.');
    await responseClosed;
    await client.disconnect();

    expect(signal.aborted).toBe(false);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('gives a response one signal however often it is asked', async () => {
    const { origin, exchange } = await serveOneBodyRead();
    const client = openSocketRequest(origin, { prompt: 'Привет.' });
    const { response } = await exchange;

    expect(clientDisconnectSignal(response)).toBe(clientDisconnectSignal(response));

    await client.disconnect();
  });

  it('is already aborted for a response whose client left before it was asked', async () => {
    const { origin, exchange } = await serveOneBodyRead();
    const client = openSocketRequest(origin, { prompt: 'Привет.' });
    const { response, responseClosed } = await exchange;

    await client.disconnect();
    await responseClosed;

    expect(clientDisconnectSignal(response).aborted).toBe(true);
  });
});

describe('handledAsClientDisconnect', () => {
  async function disconnectedResponse(): Promise<{ response: http.ServerResponse; disconnect: AbortSignal }> {
    const { origin, exchange } = await serveOneBodyRead();
    const client = openSocketRequest(origin, { prompt: 'Привет.' });
    const { response, responseClosed } = await exchange;
    const disconnect = clientDisconnectSignal(response);

    await client.disconnect();
    await responseClosed;

    return { disconnect, response };
  }

  it("handles the abort of the response's own disconnect signal and logs it at info", async () => {
    const { disconnect, response } = await disconnectedResponse();
    const { lines, logger } = createCapturingLogger();

    expect(handledAsClientDisconnect(disconnect.reason, { log: logger, raw: response })).toBe(true);
    expect(lines).toEqual([expect.objectContaining({ level: 'info', msg: CLIENT_DISCONNECT_LOG_MESSAGE })]);
  });

  it('leaves any other abort to the caller, although the client has left', async () => {
    const { response } = await disconnectedResponse();
    const { lines, logger } = createCapturingLogger();
    const serverAbort = new DOMException('The server canceled the work.', 'AbortError');

    expect(handledAsClientDisconnect(serverAbort, { log: logger, raw: response })).toBe(false);
    expect(lines).toEqual([]);
  });

  it('leaves an error on a response that never asked for its disconnect signal to the caller', async () => {
    const { origin, exchange } = await serveOneBodyRead();
    const client = openSocketRequest(origin, { prompt: 'Привет.' });
    const { response, responseClosed } = await exchange;
    const { logger } = createCapturingLogger();

    await client.disconnect();
    await responseClosed;

    expect(handledAsClientDisconnect(new Error('Сбой.'), { log: logger, raw: response })).toBe(false);
  });
});

interface HeldResponseServer {
  readonly origin: string;
  readonly requestReceived: Promise<void>;
  readonly responseClosed: Promise<void>;
}

async function serveHeldResponses(): Promise<HeldResponseServer> {
  const requestReceived = createDeferred();
  const responseClosed = createDeferred();
  const server = http.createServer((request, response) => {
    if (request.url !== '/held' && request.url !== '/streaming') {
      response.writeHead(204).end();
      return;
    }

    response.once('close', () => responseClosed.resolve());

    if (request.url === '/streaming') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('data: первый\n\n');
    }

    requestReceived.resolve();
  });

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

  return {
    origin: `http://127.0.0.1:${address.port}`,
    requestReceived: requestReceived.promise,
    responseClosed: responseClosed.promise,
  };
}

describe('fetch aborted through AbortSignal.any with a timeout', () => {
  const LONG_TIMEOUT_MS = 60_000;

  function postAbortably(url: string, disconnect: AbortController): Promise<Response> {
    return fetch(url, {
      body: '{}',
      method: 'POST',
      signal: AbortSignal.any([disconnect.signal, AbortSignal.timeout(LONG_TIMEOUT_MS)]),
    });
  }

  it('rejects with the abort reason object itself before the response arrives', async () => {
    const { origin, requestReceived, responseClosed } = await serveHeldResponses();
    const disconnect = new AbortController();
    const reason = new DOMException('The client left.', 'AbortError');
    const settled = postAbortably(`${origin}/held`, disconnect).then(
      () => null,
      (error: unknown) => error,
    );

    await requestReceived;
    disconnect.abort(reason);

    expect(await settled).toBe(reason);
    await responseClosed;
    expect((await fetch(`${origin}/after-abort`, { method: 'POST' })).status).toBe(204);
  });

  it('errors the body with the abort reason object itself once the response has arrived', async () => {
    const { origin, responseClosed } = await serveHeldResponses();
    const disconnect = new AbortController();
    const reason = new DOMException('The client left.', 'AbortError');
    const response = await postAbortably(`${origin}/streaming`, disconnect);
    const reader = response.body?.getReader();

    expect(reader).toBeDefined();
    await reader?.read();
    disconnect.abort(reason);

    await expect(reader?.read()).rejects.toBe(reason);
    await responseClosed;
    expect((await fetch(`${origin}/after-abort`, { method: 'POST' })).status).toBe(204);
  });
});
