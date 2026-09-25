import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { CommandFailedError, quoteWindowsArg, resolveCommand, runCommand, runCommandQuiet } from './run-command.ts';

describe('quoteWindowsArg', () => {
  test('quotes the empty string', () => {
    assert.equal(quoteWindowsArg(''), '""');
  });

  test('leaves a plain argument unquoted', () => {
    assert.equal(quoteWindowsArg('--frozen-lockfile'), '--frozen-lockfile');
    assert.equal(quoteWindowsArg('C:\\plain\\'), 'C:\\plain\\');
  });

  test('quotes an argument with spaces', () => {
    assert.equal(quoteWindowsArg('with space'), '"with space"');
  });

  test('escapes embedded quotes and the backslashes before them', () => {
    assert.equal(quoteWindowsArg('say "hi"'), '"say \\"hi\\""');
    assert.equal(quoteWindowsArg('a\\"b'), '"a\\\\\\"b"');
  });

  test('doubles trailing backslashes inside quotes', () => {
    assert.equal(quoteWindowsArg('C:\\dir with space\\'), '"C:\\dir with space\\\\"');
  });
});

describe('resolveCommand', () => {
  test('wraps the command in cmd.exe only on win32', () => {
    assert.deepEqual(resolveCommand('npm', ['run', 'ci'], 'linux'), {
      file: 'npm',
      args: ['run', 'ci'],
      windowsVerbatimArguments: false,
    });
    assert.equal(resolveCommand('npm', ['run', 'ci'], 'darwin').file, 'npm');
    assert.deepEqual(resolveCommand('npm', ['run', 'my script'], 'win32'), {
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', '"npm run "my script""'],
      windowsVerbatimArguments: true,
    });
  });
});

describe('runCommand', () => {
  test('throws CommandFailedError with the exit status', () => {
    assert.throws(
      () => runCommand('node', ['-e', 'process.exit(3)']),
      (error: unknown) => error instanceof CommandFailedError && error.status === 3,
    );
  });

  test('returns quietly when the command succeeds', () => {
    assert.doesNotThrow(() => runCommand('node', ['-e', 'process.exit(0)']));
  });
});

describe('runCommandQuiet', () => {
  test('passes spaces, quotes, trailing backslashes and empty arguments through unchanged', () => {
    const args = ['plain', 'with space', 'say "hi"', 'C:\\dir with space\\', ''];
    const result = runCommandQuiet('node', ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...args]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), args);
  });

  test('reports the status and output instead of throwing', () => {
    const result = runCommandQuiet('node', ['-e', 'process.stderr.write("broken");process.exit(2)']);

    assert.equal(result.status, 2);
    assert.equal(result.stderr, 'broken');
  });
});
