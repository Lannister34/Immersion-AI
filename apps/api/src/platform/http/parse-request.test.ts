import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseRequest, RequestValidationError } from './parse-request.js';

const RenameCommandSchema = z.object({
  title: z.string().trim().min(1, 'Название не может быть пустым.'),
  tags: z.array(z.string()).max(2, 'Не больше двух меток.').default([]),
});

describe('parseRequest', () => {
  it('returns the schema output, with defaults and transforms applied', () => {
    expect(parseRequest(RenameCommandSchema, { title: '  Глава 1  ' })).toEqual({ tags: [], title: 'Глава 1' });
  });

  it('throws a RequestValidationError that carries every issue and names the first', () => {
    let thrown: unknown;

    try {
      parseRequest(RenameCommandSchema, { tags: ['a', 'b', 'c'], title: ' ' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RequestValidationError);
    expect(thrown).toMatchObject({
      issues: [{ message: 'Название не может быть пустым.' }, { message: 'Не больше двух меток.' }],
      message: 'Название не может быть пустым.',
    });
  });

  it('falls back to a generic message when the first issue has none', () => {
    const SilentSchema = z.string().refine(() => false, { message: '' });

    expect(() => parseRequest(SilentSchema, 'x')).toThrow('Invalid request payload.');
  });
});
