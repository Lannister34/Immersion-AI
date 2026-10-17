import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseUpdateBaselineArguments } from '../src/baseline/update-baseline-arguments.mjs';

class ArgumentsError extends Error {}

describe('the update-baseline arguments', () => {
  it('reads no argument as a check and --update-baseline as an update', () => {
    assert.deepEqual(parseUpdateBaselineArguments([], ArgumentsError), { update: false });
    assert.deepEqual(parseUpdateBaselineArguments(['--update-baseline'], ArgumentsError), { update: true });
  });

  it('refuses any other argument with the error type it was given, even beside --update-baseline', () => {
    for (const argv of [['--update'], ['--update-baseline', '--staged'], ['apps/api/src/a.ts']]) {
      assert.throws(
        () => parseUpdateBaselineArguments(argv, ArgumentsError),
        (error) =>
          error instanceof ArgumentsError &&
          error.message === `unknown argument ${argv.at(-1)}; the only option is --update-baseline`,
        argv.join(' '),
      );
    }
  });
});
