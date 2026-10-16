import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readCommandArguments } from '../src/launchers/command-arguments.mjs';

describe('command arguments', () => {
  it('reads the leading options and the first argument after them', () => {
    assert.deepEqual(readCommandArguments('npx --no -y biome check --staged', 3), {
      options: ['--no', '-y'],
      positional: 'biome',
    });
  });

  it('starts reading at the given offset, after the command itself', () => {
    assert.deepEqual(readCommandArguments('call npx --yes concurrently', 8), {
      options: ['--yes'],
      positional: 'concurrently',
    });
  });

  it('ends the options at --, which is not an option, and takes the argument after it', () => {
    assert.deepEqual(readCommandArguments('npm init -y -- --yes vite', 8), {
      options: ['-y'],
      positional: '--yes',
    });
  });

  it('gives no positional argument when only options or a trailing -- follow', () => {
    assert.deepEqual(readCommandArguments('npm init -y --scope=@immersion', 8), {
      options: ['-y', '--scope=@immersion'],
      positional: null,
    });
    assert.deepEqual(readCommandArguments('npm init -- ', 8), { options: [], positional: null });
    assert.deepEqual(readCommandArguments('npx', 3), { options: [], positional: null });
  });

  it('stops at a quote, a shell operator or a continuation caret', () => {
    assert.deepEqual(readCommandArguments('npx "--no" biome', 3), { options: [], positional: null });
    assert.deepEqual(readCommandArguments('npx --no && npx --yes biome', 3), { options: ['--no'], positional: null });
    assert.deepEqual(readCommandArguments('call npx ^', 8), { options: [], positional: null });
  });

  it('separates arguments by tabs as well as spaces', () => {
    assert.deepEqual(readCommandArguments('npx\t--no\tbiome', 3), { options: ['--no'], positional: 'biome' });
  });

  it('reads the value of an option written as a separate argument as the positional one', () => {
    assert.deepEqual(readCommandArguments('npx -p foo --no bar', 3), { options: ['-p'], positional: 'foo' });
    assert.deepEqual(readCommandArguments('npm init --scope @x', 8), {
      options: ['--scope'],
      positional: '@x',
    });
  });
});
