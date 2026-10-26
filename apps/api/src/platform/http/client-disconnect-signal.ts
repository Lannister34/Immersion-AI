import type { ServerResponse } from 'node:http';

import type { FastifyBaseLogger } from 'fastify';

export interface ClientDisconnectReply {
  readonly raw: ServerResponse;
  readonly log: Pick<FastifyBaseLogger, 'info'>;
}

const signalsByResponse = new WeakMap<ServerResponse, AbortSignal>();

function createClientDisconnectSignal(response: ServerResponse): AbortSignal {
  const controller = new AbortController();
  const abortUnlessEnded = () => {
    if (!response.writableEnded) {
      controller.abort(new DOMException('The client closed the connection before the response ended.', 'AbortError'));
    }
  };

  if (response.destroyed) {
    abortUnlessEnded();
  } else {
    response.once('close', abortUnlessEnded);
  }

  return controller.signal;
}

export function clientDisconnectSignal(response: ServerResponse): AbortSignal {
  const existing = signalsByResponse.get(response);

  if (existing !== undefined) {
    return existing;
  }

  const signal = createClientDisconnectSignal(response);
  signalsByResponse.set(response, signal);

  return signal;
}

function isClientDisconnect(response: ServerResponse, error: unknown): boolean {
  const signal = signalsByResponse.get(response);

  return signal?.aborted === true && error === signal.reason;
}

export function handledAsClientDisconnect(error: unknown, reply: ClientDisconnectReply): boolean {
  if (!isClientDisconnect(reply.raw, error)) {
    return false;
  }

  reply.log.info('Client disconnected before the response ended');

  return true;
}
