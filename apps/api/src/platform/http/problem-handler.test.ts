import { once } from 'node:events';
import type { ServerResponse } from 'node:http';

import { ApiProblemSchema } from '@immersion/contracts/common';
import Fastify, {
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';
import { describe, expect, it, onTestFinished } from 'vitest';
import { z } from 'zod';

import { type CapturingLogger, createCapturingLogger } from '../../test-support/capturing-logger.js';
import {
  CLIENT_DISCONNECT_LOG_MESSAGE,
  clientDisconnectOutcome,
} from '../../test-support/client-disconnect-outcome.js';
import { createDeferred } from '../../test-support/deferred.js';
import { openSocketRequest } from '../../test-support/open-socket-request.js';
import type { ApiLogger } from '../logging/api-logger.js';
import { resolveContainedFilePath } from '../storage/contained-path.js';
import { clientDisconnectSignal } from './client-disconnect-signal.js';
import { parseRequest } from './parse-request.js';
import { platformProblems } from './platform-problems.js';
import { contractProblem, type Problem, problem } from './problem.js';
import {
  installNotFoundHandler,
  installProblemHandler,
  type ProblemHandlerOptions,
  type ProblemRenderer,
} from './problem-handler.js';
import { createProblemTable, problemFor } from './problem-table.js';

const BODY_LIMIT_BYTES = 1024;
const UNEXPECTED = { code: 'internal_error', message: 'Unexpected error.' };

class BookNotFoundError extends Error {}

class CatalogUnavailableError extends Error {}

class BookReservedError extends Error {
  constructor(readonly reader: string) {
    super(`Book reserved by ${reader}`);
  }
}

const BookReservedProblemSchema = ApiProblemSchema.extend({ reservedBy: z.string() });

const BookCommandSchema = z.object({
  title: z.string().min(1, 'Название книги обязательно.'),
  year: z.number().int('Год должен быть целым.'),
});

const StoredBookSchema = z.object({ title: z.string() });

const shelfProblems = createProblemTable(
  platformProblems,
  problemFor(BookNotFoundError, () => problem(404, 'book_not_found', 'Книга не найдена.')),
  problemFor(CatalogUnavailableError, () => problem(502, 'catalog_unavailable', 'Каталог недоступен.')),
  problemFor(BookReservedError, (error) =>
    contractProblem(409, BookReservedProblemSchema, {
      code: 'book_reserved',
      message: 'Книга уже выдана.',
      reservedBy: error.reader,
    }),
  ),
);

function envelope(answer: Problem): unknown {
  return { error: { code: answer.body.code, message: answer.body.message, status: answer.statusCode } };
}

function registerBookRoutes(books: FastifyInstance): void {
  books.post('/', async (request) => parseRequest(BookCommandSchema, request.body));
  books.get('/unsafe', async () => resolveContainedFilePath('shelf', '../user-settings.json'));
  books.get('/stored', async () => StoredBookSchema.parse({ title: 42 }));
  books.get('/crash', async () => {
    throw new Error('EACCES: C:\\Users\\Мария\\secret-token.json');
  });
  books.get('/thrown-string', async () => {
    throw 'строка вместо ошибки';
  });
  books.get('/missing', async () => {
    throw new BookNotFoundError('Война и мир');
  });
  books.get('/catalog', async () => {
    throw new CatalogUnavailableError('catalog timed out');
  });
  books.get('/reserved', async () => {
    throw new BookReservedError('Мария');
  });
}

interface ShelfAppOptions {
  readonly root?: Omit<ProblemHandlerOptions, 'table'>;
  readonly notFoundRender?: ProblemRenderer;
  readonly enveloped?: boolean;
}

type ShelfFastify = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  ApiLogger
>;

interface ShelfApp {
  readonly app: ShelfFastify;
  readonly logs: CapturingLogger;
}

function buildShelfApp(options: ShelfAppOptions = {}): ShelfApp {
  const logs = createCapturingLogger();
  const app = Fastify({ bodyLimit: BODY_LIMIT_BYTES, loggerInstance: logs.logger });
  onTestFinished(() => app.close());

  installProblemHandler(app, { table: shelfProblems, ...options.root });
  installNotFoundHandler(app, options.notFoundRender);
  app.register(async (books) => registerBookRoutes(books), { prefix: '/books' });

  if (options.enveloped === true) {
    app.register(
      async (enveloped) => {
        installProblemHandler(enveloped, { table: shelfProblems, render: envelope });
        registerBookRoutes(enveloped);
      },
      { prefix: '/v1' },
    );
  }

  return { app, logs };
}

function linesWithCode(logs: CapturingLogger, code: string): readonly Readonly<Record<string, unknown>>[] {
  return logs.lines.filter((line) => line.code === code);
}

describe('installProblemHandler', () => {
  it('answers a request validation failure with 400 validation_error and the first issue', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({ method: 'POST', url: '/books', payload: { title: '', year: 1.5 } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'validation_error', message: 'Название книги обязательно.' });
  });

  it('rejects an unsafe file id with 400', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({ method: 'GET', url: '/books/unsafe' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'validation_error', message: 'Invalid resource identifier.' });
  });

  it('answers a ZodError that did not come from the request with a logged 500', async () => {
    const { app, logs } = buildShelfApp();

    const response = await app.inject({ method: 'GET', url: '/books/stored' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(UNEXPECTED);
    expect(logs.lines).toContainEqual(
      expect.objectContaining({ err: expect.objectContaining({ type: 'ZodError' }), level: 'error' }),
    );
  });

  it('answers an unknown error with a generic 500 that does not leak its message', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({ method: 'GET', url: '/books/crash' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(UNEXPECTED);
    expect(response.body).not.toContain('secret-token');
  });

  it('answers a thrown value that is not an error with the generic 500', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({ method: 'GET', url: '/books/thrown-string' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(UNEXPECTED);
  });

  it('logs 4xx at info and 5xx at error', async () => {
    const { app, logs } = buildShelfApp();

    await app.inject({ method: 'GET', url: '/books/missing' });
    await app.inject({ method: 'GET', url: '/books/catalog' });

    const rejected = linesWithCode(logs, 'book_not_found');
    const failed = linesWithCode(logs, 'catalog_unavailable');
    expect(rejected).toEqual([expect.objectContaining({ level: 'info', reqId: expect.any(String), statusCode: 404 })]);
    expect(rejected[0]).not.toHaveProperty('err');
    expect(failed).toEqual([
      expect.objectContaining({
        err: expect.objectContaining({ message: 'catalog timed out' }),
        level: 'error',
        reqId: expect.any(String),
        statusCode: 502,
      }),
    ]);
    expect(logs.lines.filter((line) => line.level === 'error')).toHaveLength(1);
    expect(logs.lines.filter((line) => line.level === 'warn')).toEqual([]);
  });

  it('logs a rejected request with the reason it answered, so a refused import can be diagnosed from the log', async () => {
    const { app, logs } = buildShelfApp();

    await app.inject({ method: 'POST', url: '/books', payload: { title: 'Бесы', year: 1871.5 } });

    expect(linesWithCode(logs, 'validation_error')).toEqual([
      expect.objectContaining({ level: 'info', message: 'Год должен быть целым.', statusCode: 400 }),
    ]);
  });

  it('logs an unmapped error at error with the error and the request id', async () => {
    const { app, logs } = buildShelfApp();

    await app.inject({ method: 'GET', url: '/books/crash' });

    expect(logs.lines.filter((line) => line.level === 'error')).toEqual([
      expect.objectContaining({
        err: expect.objectContaining({ message: expect.stringContaining('secret-token') }),
        reqId: expect.any(String),
      }),
    ]);
  });

  it('answers malformed JSON with 400 invalid_request', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({
      method: 'POST',
      url: '/books',
      headers: { 'content-type': 'application/json' },
      payload: '{"title": "Мастер и Маргарита"',
    });

    expect(response.statusCode).toBe(400);
    expect(ApiProblemSchema.parse(response.json())).toMatchObject({ code: 'invalid_request' });
  });

  it('answers an empty JSON body with 400 invalid_request', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({
      method: 'POST',
      url: '/books',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(response.statusCode).toBe(400);
    expect(ApiProblemSchema.parse(response.json())).toMatchObject({ code: 'invalid_request' });
  });

  it('answers a body whose size disagrees with its Content-Length with 400 invalid_request', async () => {
    const { app } = buildShelfApp();
    const payload = '{"title":"Обломов","year":1859}';

    const response = await app.inject({
      method: 'POST',
      url: '/books',
      headers: { 'content-length': String(Buffer.byteLength(payload) - 1), 'content-type': 'application/json' },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(ApiProblemSchema.parse(response.json())).toMatchObject({ code: 'invalid_request' });
  });

  it('answers a wrong content type with 415', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({
      method: 'POST',
      url: '/books',
      headers: { 'content-type': 'application/xml' },
      payload: '<book title="Идиот"/>',
    });

    expect(response.statusCode).toBe(415);
    expect(ApiProblemSchema.parse(response.json())).toMatchObject({ code: 'unsupported_media_type' });
  });

  it('answers an oversized body with 413', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({
      method: 'POST',
      url: '/books',
      payload: { title: 'ж'.repeat(BODY_LIMIT_BYTES), year: 1869 },
    });

    expect(response.statusCode).toBe(413);
    expect(ApiProblemSchema.parse(response.json())).toMatchObject({ code: 'payload_too_large' });
  });

  it('sends a mapped body as-is, so the fields of a contracted subtype survive', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({ method: 'GET', url: '/books/reserved' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'book_reserved', message: 'Книга уже выдана.', reservedBy: 'Мария' });
  });

  it('renders mapped and unexpected problems through the renderers it is given', async () => {
    const { app } = buildShelfApp({
      root: {
        render: envelope,
        renderUnexpected: (error) => problem(500, 'internal_error', error instanceof Error ? error.message : '?'),
      },
    });

    const missing = await app.inject({ method: 'GET', url: '/books/missing' });
    const crashed = await app.inject({ method: 'GET', url: '/books/crash' });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: { code: 'book_not_found', message: 'Книга не найдена.', status: 404 } });
    expect(crashed.statusCode).toBe(500);
    expect(crashed.json()).toEqual({
      error: { code: 'internal_error', message: 'EACCES: C:\\Users\\Мария\\secret-token.json', status: 500 },
    });
  });

  it('lets an encapsulated plugin install its own renderer without changing the root answers', async () => {
    const { app } = buildShelfApp({ enveloped: true });

    const inside = await app.inject({ method: 'GET', url: '/v1/missing' });
    const outside = await app.inject({ method: 'GET', url: '/books/missing' });

    expect(inside.json()).toEqual({ error: { code: 'book_not_found', message: 'Книга не найдена.', status: 404 } });
    expect(outside.json()).toEqual({ code: 'book_not_found', message: 'Книга не найдена.' });
  });
});

describe('installNotFoundHandler', () => {
  it.each([
    '/shelves',
    '/books/unknown/deeper',
  ])('answers an unknown route with 404 route_not_found: %s', async (url) => {
    const { app, logs } = buildShelfApp();

    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(404);
    expect(ApiProblemSchema.parse(response.json())).toMatchObject({ code: 'route_not_found' });
    expect(linesWithCode(logs, 'route_not_found')).toEqual([expect.objectContaining({ level: 'info' })]);
  });

  it('answers an unknown method on a known route with 404 route_not_found', async () => {
    const { app } = buildShelfApp();

    const response = await app.inject({ method: 'PATCH', url: '/books/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'route_not_found' });
  });

  it('answers an unknown route through the renderer it is given', async () => {
    const { app } = buildShelfApp({ notFoundRender: envelope });

    const response = await app.inject({ method: 'GET', url: '/shelves' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'route_not_found', status: 404 } });
  });
});

type ErrorAfterDisconnect = (disconnect: AbortSignal) => unknown;

interface DisconnectingShelf {
  readonly origin: string;
  readonly logs: CapturingLogger;
  readonly entered: Promise<ServerResponse>;
}

async function serveErrorAfterDisconnect(errorAfterDisconnect: ErrorAfterDisconnect): Promise<DisconnectingShelf> {
  const logs = createCapturingLogger();
  const app = Fastify({ loggerInstance: logs.logger });
  const entered = createDeferred<ServerResponse>();
  onTestFinished(() => app.close());

  function registerWaitRoute(books: FastifyInstance): void {
    books.post('/wait', async (_request, reply) => {
      const disconnect = clientDisconnectSignal(reply.raw);
      entered.resolve(reply.raw);

      if (!disconnect.aborted) {
        await once(disconnect, 'abort');
      }

      throw errorAfterDisconnect(disconnect);
    });
  }

  installProblemHandler(app, { table: shelfProblems });
  app.register(async (books) => registerWaitRoute(books), { prefix: '/books' });
  app.register(
    async (enveloped) => {
      installProblemHandler(enveloped, { table: shelfProblems, render: envelope });
      registerWaitRoute(enveloped);
    },
    { prefix: '/v1' },
  );

  return { entered: entered.promise, logs, origin: await app.listen({ host: '127.0.0.1', port: 0 }) };
}

describe('installProblemHandler when the client disconnects mid-request', () => {
  it.each([
    '/books',
    '/v1',
  ])('logs the abort of the client disconnect at info and sends nothing to the closed response: %s', async (prefix) => {
    const { entered, logs, origin } = await serveErrorAfterDisconnect((disconnect) => disconnect.reason);
    const client = openSocketRequest(`${origin}${prefix}/wait`, { title: 'Анна Каренина' });
    const response = await entered;
    const outcome = clientDisconnectOutcome(logs);

    await client.disconnect();

    expect(await outcome).toMatchObject({
      level: 'info',
      msg: CLIENT_DISCONNECT_LOG_MESSAGE,
      reqId: expect.any(String),
    });
    expect(logs.lines.filter((line) => line.level === 'error')).toEqual([]);
    expect(response.headersSent).toBe(false);
  });

  it.each([
    ['an abort the server started itself', () => new DOMException('The server canceled the work.', 'AbortError')],
    ['a provider timeout', () => new DOMException('The operation was aborted due to timeout.', 'TimeoutError')],
  ])('logs %s at error although the client has left', async (_name, errorAfterDisconnect) => {
    const { entered, logs, origin } = await serveErrorAfterDisconnect(errorAfterDisconnect);
    const client = openSocketRequest(`${origin}/books/wait`, { title: 'Анна Каренина' });
    await entered;
    const outcome = clientDisconnectOutcome(logs);

    await client.disconnect();

    expect(await outcome).toMatchObject({ level: 'error', msg: 'Request failed with an unexpected error' });
    expect(logs.lines).not.toContainEqual(expect.objectContaining({ msg: CLIENT_DISCONNECT_LOG_MESSAGE }));
  });
});
