import type { Problem } from './problem.js';

export type ErrorClass<E extends Error> = abstract new (...args: never[]) => E;

export interface ProblemRule {
  readonly errorClass: ErrorClass<Error>;
  problemOf(error: unknown): Problem | null;
}

export interface ProblemTable {
  readonly rules: readonly ProblemRule[];
  map(error: unknown): Problem | null;
}

export class DuplicateProblemRuleError extends Error {
  constructor(errorClass: ErrorClass<Error>) {
    super(`Two problem rules map the same error class: ${errorClass.name}.`);
    this.name = 'DuplicateProblemRuleError';
  }
}

export class UnmatchableProblemRuleError extends Error {
  constructor(errorClass: ErrorClass<Error>) {
    super(
      `${errorClass.name} does not count an object built on its prototype as an instance, so a problem table, which finds rules by prototype, could never match its errors.`,
    );
    this.name = 'UnmatchableProblemRuleError';
  }
}

function isFoundByItsPrototype(errorClass: ErrorClass<Error>): boolean {
  return Object.create(errorClass.prototype) instanceof errorClass;
}

export function problemFor<E extends Error>(errorClass: ErrorClass<E>, toProblem: (error: E) => Problem): ProblemRule {
  return {
    errorClass,
    problemOf: (error) => (error instanceof errorClass ? toProblem(error) : null),
  };
}

function isProblemTable(entry: ProblemRule | ProblemTable): entry is ProblemTable {
  return 'rules' in entry;
}

export function createProblemTable(...entries: readonly (ProblemRule | ProblemTable)[]): ProblemTable {
  const rules = entries.flatMap((entry) => (isProblemTable(entry) ? entry.rules : [entry]));
  const rulesByPrototype = new Map<unknown, ProblemRule>();

  for (const rule of rules) {
    if (!isFoundByItsPrototype(rule.errorClass)) {
      throw new UnmatchableProblemRuleError(rule.errorClass);
    }

    if (rulesByPrototype.has(rule.errorClass.prototype)) {
      throw new DuplicateProblemRuleError(rule.errorClass);
    }

    rulesByPrototype.set(rule.errorClass.prototype, rule);
  }

  return {
    rules,
    map(error) {
      if (typeof error !== 'object' || error === null) {
        return null;
      }

      for (
        let prototype: unknown = Object.getPrototypeOf(error);
        prototype !== null;
        prototype = Object.getPrototypeOf(prototype)
      ) {
        const rule = rulesByPrototype.get(prototype);

        if (rule !== undefined) {
          return rule.problemOf(error);
        }
      }

      return null;
    },
  };
}
