import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';

import { type Problem, problem } from './problem.js';
import type { ProblemTable } from './problem-table.js';

export type ProblemRenderer = (problem: Problem) => unknown;

export interface ProblemHandlerOptions {
  readonly table: ProblemTable;
  readonly render?: ProblemRenderer;
  readonly renderUnexpected?: (error: unknown) => Problem;
}

type ProblemHandlerHost<Logger extends FastifyBaseLogger> = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  Logger
>;

const SERVER_FAULT_STATUS = 500;
const UNEXPECTED_PROBLEM = problem(SERVER_FAULT_STATUS, 'internal_error', 'Unexpected error.');
const ROUTE_NOT_FOUND_PROBLEM = problem(404, 'route_not_found', 'Такого адреса в API нет.');

function problemBody(answer: Problem): unknown {
  return answer.body;
}

export function installProblemHandler<Logger extends FastifyBaseLogger>(
  app: ProblemHandlerHost<Logger>,
  options: ProblemHandlerOptions,
): void {
  const render = options.render ?? problemBody;
  const renderUnexpected = options.renderUnexpected ?? (() => UNEXPECTED_PROBLEM);

  app.setErrorHandler((error, request, reply) => {
    const mapped = options.table.map(error);

    if (mapped === null) {
      request.log.error({ err: error }, 'Request failed with an unexpected error');
    } else if (mapped.statusCode >= SERVER_FAULT_STATUS) {
      request.log.error({ code: mapped.body.code, err: error, statusCode: mapped.statusCode }, 'Request failed');
    } else {
      request.log.info(
        { code: mapped.body.code, message: mapped.body.message, statusCode: mapped.statusCode },
        'Request rejected',
      );
    }

    const answer = mapped ?? renderUnexpected(error);

    return reply.status(answer.statusCode).send(render(answer));
  });
}

export function installNotFoundHandler<Logger extends FastifyBaseLogger>(
  app: ProblemHandlerHost<Logger>,
  render: ProblemRenderer = problemBody,
): void {
  app.setNotFoundHandler((request, reply) => {
    request.log.info(
      { code: ROUTE_NOT_FOUND_PROBLEM.body.code, statusCode: ROUTE_NOT_FOUND_PROBLEM.statusCode },
      'Route not found',
    );

    return reply.status(ROUTE_NOT_FOUND_PROBLEM.statusCode).send(render(ROUTE_NOT_FOUND_PROBLEM));
  });
}
