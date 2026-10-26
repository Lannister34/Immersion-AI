import { once } from 'node:events';
import http from 'node:http';

import { describe, expect, it, onTestFinished } from 'vitest';

import { createDeferred } from '../../test-support/deferred.js';
import { openSocketRequest } from '../../test-support/open-socket-request.js';
import { clientDisconnectSignal } from './client-disconnect-signal.js';

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

  it('is already aborted for a response whose client left before it was asked', async () => {
    const { origin, exchange } = await serveOneBodyRead();
    const client = openSocketRequest(origin, { prompt: 'Привет.' });
    const { response, responseClosed } = await exchange;

    await client.disconnect();
    await responseClosed;

    expect(clientDisconnectSignal(response).aborted).toBe(true);
  });
});
