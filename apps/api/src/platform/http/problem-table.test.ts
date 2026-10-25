import { errorCodes } from 'fastify';
import { describe, expect, it } from 'vitest';
import { ZodError, z } from 'zod';

import { problem } from './problem.js';
import {
  createProblemTable,
  DuplicateProblemRuleError,
  problemFor,
  UnmatchableProblemRuleError,
} from './problem-table.js';

class ShelfError extends Error {}

class MissingBookError extends ShelfError {
  constructor(readonly title: string) {
    super(`Книга не найдена: ${title}`);
  }
}

class MissingRareBookError extends MissingBookError {}

class UnrelatedError extends Error {}

describe('createProblemTable', () => {
  it('maps a subclass through its nearest registered class', () => {
    const table = createProblemTable(
      problemFor(ShelfError, () => problem(500, 'shelf_broken', 'Полка сломана.')),
      problemFor(MissingBookError, (error) => problem(404, 'book_not_found', `Нет книги «${error.title}».`)),
    );

    expect(table.map(new MissingRareBookError('Гамлет'))).toEqual(
      problem(404, 'book_not_found', 'Нет книги «Гамлет».'),
    );
    expect(table.map(new ShelfError('Полка'))).toEqual(problem(500, 'shelf_broken', 'Полка сломана.'));
  });

  it('picks the nearest class even when a farther one comes from an earlier table', () => {
    const table = createProblemTable(
      createProblemTable(problemFor(ShelfError, () => problem(500, 'shelf_broken', 'Полка сломана.'))),
      createProblemTable(problemFor(MissingBookError, () => problem(404, 'book_not_found', 'Нет книги.'))),
    );

    expect(table.map(new MissingRareBookError('Гамлет'))?.body.code).toBe('book_not_found');
  });

  it('throws at composition when two tables register the same class', () => {
    const first = createProblemTable(problemFor(MissingBookError, () => problem(404, 'book_not_found', 'Нет книги.')));
    const second = createProblemTable(problemFor(MissingBookError, () => problem(410, 'book_gone', 'Книга ушла.')));

    expect(() => createProblemTable(first, second)).toThrow(DuplicateProblemRuleError);
    expect(() => createProblemTable(first, second)).toThrow(/MissingBookError/);
  });

  it('throws when one table registers a class twice', () => {
    const rule = problemFor(MissingBookError, () => problem(404, 'book_not_found', 'Нет книги.'));

    expect(() => createProblemTable(rule, rule)).toThrow(DuplicateProblemRuleError);
  });

  it('refuses a class whose instanceof rejects objects built on its prototype, since lookup goes by prototype', () => {
    class LooseBookError extends Error {
      static [Symbol.hasInstance](value: unknown): boolean {
        return value instanceof Error && value.message.startsWith('Книга');
      }
    }

    expect(() =>
      createProblemTable(problemFor(LooseBookError, () => problem(404, 'book_not_found', 'Нет книги.'))),
    ).toThrow(UnmatchableProblemRuleError);
  });

  it('refuses ZodError, because zod 4 errors pass instanceof without inheriting ZodError.prototype', () => {
    const thrown = z.string().safeParse(404).error;

    expect(thrown).toBeInstanceOf(ZodError);
    expect(Object.getPrototypeOf(thrown)).not.toBe(ZodError.prototype);
    expect(() =>
      createProblemTable(problemFor(ZodError, () => problem(400, 'validation_error', 'Неверный запрос.'))),
    ).toThrow(UnmatchableProblemRuleError);
  });

  it('accepts a class with its own instanceof that still counts objects built on its prototype, as Fastify errors do', () => {
    const table = createProblemTable(
      problemFor(errorCodes.FST_ERR_CTP_BODY_TOO_LARGE, () => problem(413, 'payload_too_large', 'Слишком много.')),
    );

    expect(Object.hasOwn(errorCodes.FST_ERR_CTP_BODY_TOO_LARGE, Symbol.hasInstance)).toBe(true);
    expect(table.map(new errorCodes.FST_ERR_CTP_BODY_TOO_LARGE())?.statusCode).toBe(413);
  });

  it('returns null for an unregistered error', () => {
    const table = createProblemTable(problemFor(MissingBookError, () => problem(404, 'book_not_found', 'Нет книги.')));

    expect(table.map(new UnrelatedError('Книга не найдена: Гамлет'))).toBeNull();
    expect(table.map(new Error('Книга не найдена: Гамлет'))).toBeNull();
  });

  it.each([
    ['a string', 'Книга не найдена'],
    ['undefined', undefined],
    ['null', null],
    ['a number', 404],
    ['a plain object', { name: 'MissingBookError', message: 'Книга не найдена' }],
    ['an object without a prototype', Object.create(null)],
  ])('returns null for a thrown value that is %s', (_label, thrown) => {
    const table = createProblemTable(problemFor(MissingBookError, () => problem(404, 'book_not_found', 'Нет книги.')));

    expect(table.map(thrown)).toBeNull();
  });

  it('keeps every rule of the tables it is composed from', () => {
    const books = createProblemTable(problemFor(MissingBookError, () => problem(404, 'book_not_found', 'Нет книги.')));
    const shelves = createProblemTable(problemFor(ShelfError, () => problem(500, 'shelf_broken', 'Полка сломана.')));

    const table = createProblemTable(books, shelves);

    expect(table.rules.map((rule) => rule.errorClass)).toEqual([MissingBookError, ShelfError]);
  });
});
