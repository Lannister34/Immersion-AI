import { type Mock, vi } from 'vitest';

import type { HttpFetch } from '../platform/outbound-http/http-fetch.js';
import { createDeferred } from './deferred.js';
import { type RecordedHttpRequest, recordHttpRequest } from './recorded-http-request.js';

export type HttpResponder = (request: RecordedHttpRequest) => Response | Promise<Response>;

export type HttpUrlPattern = string | RegExp;

export interface HeldHttpRequest {
  readonly started: Promise<RecordedHttpRequest>;
  release(response: Response): void;
}

export interface HttpStub {
  readonly fetch: Mock<HttpFetch>;
  readonly requests: readonly RecordedHttpRequest[];
  requestLines(): string[];
  on(method: string, url: HttpUrlPattern, respond: HttpResponder): void;
  once(method: string, url: HttpUrlPattern, respond: HttpResponder): void;
  hold(method: string, url: HttpUrlPattern): HeldHttpRequest;
}

interface HttpRoute {
  readonly method: string;
  readonly url: HttpUrlPattern;
  readonly once: boolean;
  readonly respond: HttpResponder;
}

function matches(route: HttpRoute, request: RecordedHttpRequest): boolean {
  if (route.method.toUpperCase() !== request.method) {
    return false;
  }

  if (typeof route.url === 'string') {
    return route.url === request.url;
  }

  route.url.lastIndex = 0;

  return route.url.test(request.url);
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | null): Promise<T> {
  if (signal === null) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const rejectWithReason = () => reject(signal.reason);

    if (signal.aborted) {
      rejectWithReason();
      return;
    }

    signal.addEventListener('abort', rejectWithReason, { once: true });
    promise.then((value) => {
      signal.removeEventListener('abort', rejectWithReason);
      resolve(value);
    }, reject);
  });
}

export function createHttpStub(): HttpStub {
  const requests: RecordedHttpRequest[] = [];
  const routes: HttpRoute[] = [];

  const fetch = vi.fn<HttpFetch>(async (url, init) => {
    const request = await recordHttpRequest(url, init);
    requests.push(request);
    const route = routes.find((candidate) => matches(candidate, request));

    if (route === undefined) {
      throw new TypeError('fetch failed', {
        cause: new Error(`No stubbed response for ${request.method} ${request.url}`),
      });
    }

    if (route.once) {
      routes.splice(routes.indexOf(route), 1);
    }

    return route.respond(request);
  });

  return {
    fetch,
    requests,
    requestLines() {
      return requests.map((request) => `${request.method} ${request.url}`);
    },
    on(method, url, respond) {
      routes.push({ method, url, once: false, respond });
    },
    once(method, url, respond) {
      routes.push({ method, url, once: true, respond });
    },
    hold(method, url) {
      const started = createDeferred<RecordedHttpRequest>();
      const released = createDeferred<Response>();

      routes.push({
        method,
        url,
        once: true,
        respond(request) {
          started.resolve(request);

          return untilAborted(released.promise, request.signal);
        },
      });

      return { started: started.promise, release: released.resolve };
    },
  };
}
