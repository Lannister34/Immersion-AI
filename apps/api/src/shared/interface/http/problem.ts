import { ZodError } from 'zod';

import { problem } from '../../../platform/http/problem.js';
import { UnsafeRepositoryFileIdError } from '../../../platform/storage/contained-path.js';

export { problem };

export interface ProblemReply {
  statusCode: number;
  body: object;
}

export type ModuleProblemMapper = (error: unknown) => ProblemReply | null;

export interface CreateToProblemOptions {
  exposeInternalErrorMessage?: boolean;
}

// TODO: delete when the last route module relies on the problem handler (F-31)
export function createToProblem(mapModuleError?: ModuleProblemMapper, options: CreateToProblemOptions = {}) {
  return function toProblem(error: unknown): ProblemReply {
    if (error instanceof ZodError) {
      return problem(400, 'validation_error', error.issues[0]?.message ?? 'Invalid request payload.');
    }

    if (error instanceof UnsafeRepositoryFileIdError) {
      return problem(400, 'validation_error', 'Invalid resource identifier.');
    }

    const mapped = mapModuleError?.(error);

    if (mapped) {
      return mapped;
    }

    return problem(
      500,
      'internal_error',
      options.exposeInternalErrorMessage && error instanceof Error ? error.message : 'Unexpected error.',
    );
  };
}
