import type { ZodError, ZodType } from 'zod';

export class RequestValidationError extends Error {
  readonly issues: ZodError['issues'];

  constructor(cause: ZodError) {
    super(cause.issues[0]?.message || 'Invalid request payload.', { cause });
    this.name = 'RequestValidationError';
    this.issues = cause.issues;
  }
}

export function parseRequest<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new RequestValidationError(parsed.error);
  }

  return parsed.data;
}
