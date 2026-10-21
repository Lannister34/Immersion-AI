import { type ApiProblem, ApiProblemSchema } from '@immersion/contracts/common';
import type { ZodType } from 'zod';

export interface Problem {
  readonly statusCode: number;
  readonly body: ApiProblem;
}

export function problem(statusCode: number, code: string, message: string): Problem {
  return { statusCode, body: ApiProblemSchema.parse({ code, message }) };
}

export function contractProblem<Body extends ApiProblem>(
  statusCode: number,
  schema: ZodType<Body>,
  body: Body,
): Problem {
  return { statusCode, body: schema.parse(body) };
}
