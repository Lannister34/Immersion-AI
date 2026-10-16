import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findLauncherViolations } from '../src/launchers/launcher-rules.mjs';

function flaggedColumns(text) {
  return findLauncherViolations(text).map(({ line, column }) => `${line}:${column}`);
}

describe('launcher rules', () => {
  it('flags npx --yes, which installs whatever the registry serves', () => {
    const oldStartBat = 'call npx --yes concurrently --kill-others --names api,web ^';

    assert.deepEqual(findLauncherViolations(oldStartBat), [
      { line: 1, column: 6, rule: 'downloading-package-run', excerpt: oldStartBat },
    ]);
  });

  it('flags a bare npx, which installs a missing package without asking when stdin is not a terminal', () => {
    assert.deepEqual(flaggedColumns('npx biome check --staged --no-errors-on-unmatched'), ['1:1']);
    assert.deepEqual(flaggedColumns('npx -y biome'), ['1:1']);
    assert.deepEqual(flaggedColumns('"lint": "npx"'), ['1:10']);
    assert.deepEqual(flaggedColumns('call npx ^'), ['1:6']);
    assert.deepEqual(flaggedColumns('npx "--no" biome'), ['1:1']);
  });

  it('accepts npx --no, which only runs an installed binary', () => {
    assert.deepEqual(flaggedColumns('npx --no -- commitlint --edit "$1"'), []);
    assert.deepEqual(flaggedColumns('xargs -0 -r npx --no devkit-comments -- <"$staged"'), []);
    assert.deepEqual(flaggedColumns('npx --no-install tsc'), []);
    assert.deepEqual(flaggedColumns('NPX --no biome'), []);
    assert.deepEqual(flaggedColumns('npx --NO biome'), ['1:1']);
  });

  it('flags npx --no followed by --yes, and accepts the reverse, since npm takes the last answer', () => {
    assert.deepEqual(flaggedColumns('npx --no --yes biome'), ['1:1']);
    assert.deepEqual(flaggedColumns('npx --no-install -y biome'), ['1:1']);
    assert.deepEqual(flaggedColumns('npm exec --no -y -- biome'), ['1:1']);
    assert.deepEqual(flaggedColumns('npx --no --yes=true biome'), ['1:1']);
    assert.deepEqual(flaggedColumns('npx --yes --no biome'), []);
    assert.deepEqual(flaggedColumns('npx --yes --no-yes biome && npx -y --yes=false biome'), []);
    assert.deepEqual(flaggedColumns('npx --no biome --yes'), []);
  });

  it('flags npm init with a package, every create and bun x, which run an initialiser from the registry', () => {
    assert.deepEqual(flaggedColumns('npm init vite'), ['1:1']);
    assert.deepEqual(flaggedColumns('npm init -y @vitejs/app'), ['1:1']);
    assert.deepEqual(flaggedColumns('npm init -- vite'), ['1:1']);
    assert.deepEqual(flaggedColumns('npm create vite && pnpm create vite && yarn create vite'), [
      '1:1',
      '1:20',
      '1:40',
    ]);
    assert.deepEqual(flaggedColumns('bun x create-vite'), ['1:1']);
    assert.deepEqual(flaggedColumns('npm init && npm init -y && npm init --scope=@immersion -- '), []);
  });

  it('flags an option whose value is a separate argument, which ends the options it reads', () => {
    assert.deepEqual(flaggedColumns('npx -p foo --no bar'), ['1:1']);
    assert.deepEqual(flaggedColumns('npm init --scope @x'), ['1:1']);
  });

  it('flags npm exec and npm x unless --no follows', () => {
    assert.deepEqual(flaggedColumns('npm exec biome'), ['1:1']);
    assert.deepEqual(flaggedColumns('npm  x --yes biome'), ['1:1']);
    assert.deepEqual(flaggedColumns('npm exec --no -- biome'), []);
    assert.deepEqual(flaggedColumns('npm run lint && npm install'), []);
  });

  it('flags pnpm dlx and pnpx, which always download', () => {
    assert.deepEqual(flaggedColumns('corepack pnpm dlx create-vite'), ['1:10']);
    assert.deepEqual(flaggedColumns('pnpm\tdlx --no create-vite'), ['1:1']);
    assert.deepEqual(flaggedColumns('pnpx create-vite'), ['1:1']);
    assert.deepEqual(flaggedColumns('yarn dlx create-vite'), ['1:1']);
    assert.deepEqual(flaggedColumns('bunx create-vite'), ['1:1']);
    assert.deepEqual(flaggedColumns('corepack pnpm exec biome && pnpm --filter web dev'), []);
  });

  it('ignores npx inside a longer name', () => {
    assert.deepEqual(
      flaggedColumns(
        [
          '"npx-check": "^1.0.0",',
          '"@scope/npx-runner": "1.0.0",',
          'run unpx and npxx and my_npx and npx2',
          '"lint:npx": "biome check"',
          'pnpm dlx-tools',
          'npm exec-helper',
        ].join('\n'),
      ),
      [],
    );
  });

  it('flags npx reached through a path or a Windows shim, which still runs npx', () => {
    assert.deepEqual(flaggedColumns('"C:\\Program Files\\nodejs\\npx.cmd" --yes concurrently'), ['1:26']);
    assert.deepEqual(flaggedColumns('node_modules/.bin/npx biome'), ['1:19']);
    assert.deepEqual(flaggedColumns('bunx.exe create-vite'), ['1:1']);
  });

  it('flags a command written in capitals, which cmd and PowerShell run all the same', () => {
    assert.deepEqual(flaggedColumns('CALL NPX --YES concurrently'), ['1:6']);
    assert.deepEqual(flaggedColumns('Pnpm DLX create-vite'), ['1:1']);
  });

  it('reports the line and column of each violation', () => {
    const text = ['@echo off\r', 'call npx --no biome\r', '  npx biome && pnpx tsc\r', 'pnpm dlx tsc', ''].join('\n');

    assert.deepEqual(findLauncherViolations(text), [
      { line: 3, column: 3, rule: 'downloading-package-run', excerpt: 'npx biome && pnpx tsc' },
      { line: 3, column: 16, rule: 'downloading-package-run', excerpt: 'npx biome && pnpx tsc' },
      { line: 4, column: 1, rule: 'downloading-package-run', excerpt: 'pnpm dlx tsc' },
    ]);
  });

  it('reads a launcher outside ASCII without shifting the column', () => {
    assert.deepEqual(flaggedColumns('echo  ██╗ Запуск && npx --yes concurrently'), ['1:21']);
  });
});
