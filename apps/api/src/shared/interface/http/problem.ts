import { ApiProblemSchema } from '@immersion/contracts/common';
import { ZodError } from 'zod';

import { UnsafeRepositoryFileIdError } from '../../../lib/contained-path.js';

export interface ProblemReply {
  statusCode: number;
  body: object;
}

export type ModuleProblemMapper = (error: unknown) => ProblemReply | null;

export interface CreateToProblemOptions {
  exposeInternalErrorMessage?: boolean;
}

export function problem(statusCode: number, code: string, message: string): ProblemReply {
  return {
    statusCode,
    body: ApiProblemSchema.parse({
      code,
      message,
    }),
  };
}

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
