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

describe('host binds in launchers', () => {
  it('flags a dev server bound to every interface, as PM2 started Vite', () => {
    const oldPm2Args = "      args: '--host 0.0.0.0 --port 4788',";

    assert.deepEqual(findLauncherViolations(oldPm2Args), [
      { line: 1, column: 14, rule: 'non-loopback-host-bind', excerpt: oldPm2Args.trim() },
    ]);
  });

  it('flags a bare --host, which Vite reads as every interface', () => {
    assert.deepEqual(flaggedColumns('vite --host'), ['1:6']);
    assert.deepEqual(flaggedColumns('vite --host --port 4788'), ['1:6']);
    assert.deepEqual(flaggedColumns('"dev": "vite --host",'), ['1:14']);
    assert.deepEqual(flaggedColumns('vite --host && echo done'), ['1:6']);
    assert.deepEqual(flaggedColumns('vite --host ^'), ['1:6']);
    assert.deepEqual(flaggedColumns('vite --host='), ['1:6']);
  });

  it('flags a --host that names another interface, a wildcard or a name that is not localhost', () => {
    assert.deepEqual(flaggedColumns('vite --host :: --port 4788'), ['1:6']);
    assert.deepEqual(flaggedColumns('vite --host=0.0.0.0'), ['1:6']);
    assert.deepEqual(flaggedColumns('vite "--host=0.0.0.0"'), ['1:7']);
    assert.deepEqual(flaggedColumns('vite --host 192.168.1.20'), ['1:6']);
    assert.deepEqual(flaggedColumns('vite --host my-pc.local'), ['1:6']);
    assert.deepEqual(flaggedColumns('vite --host 127.0.0.1.nip.io'), ['1:6']);
    assert.deepEqual(flaggedColumns("args: ['--host', '0.0.0.0'],"), ['1:9']);
    assert.deepEqual(flaggedColumns('vite --host\t"0.0.0.0"'), ['1:6']);
  });

  it('accepts a loopback --host, as dev:smoke passes', () => {
    assert.deepEqual(flaggedColumns('"dev:smoke": "vite --host 127.0.0.1 --port 4173",'), []);
    assert.deepEqual(flaggedColumns('vite --host localhost && vite --host ::1 && vite --host=127.0.0.1'), []);
    assert.deepEqual(flaggedColumns("args: ['--host', '127.0.0.1', '--port', '4788'],"), []);
    assert.deepEqual(flaggedColumns('vite --host "localhost"'), []);
  });

  it('accepts localhost in any letter case, which resolves the same, as the API host check does', () => {
    assert.deepEqual(flaggedColumns('vite --host LocalHost && vite --HOST=LOCALHOST'), []);
  });

  it('reads --host only as a whole option, as the CLI does', () => {
    assert.deepEqual(
      flaggedColumns(
        [
          'vite --hostname 0.0.0.0',
          'vite --host-check 0.0.0.0',
          'vite ---host 0.0.0.0',
          'tool x--host 0.0.0.0',
          'Write-Host "  [ERROR] $msg" -ForegroundColor Red',
        ].join('\n'),
      ),
      [],
    );
  });

  it('flags --host in any letter case, refusing what another CLI might fold to --host', () => {
    assert.deepEqual(flaggedColumns('vite --HOST 0.0.0.0 && vite --Host'), ['1:6', '1:29']);
  });

  it('reports a host bind and a downloading run on one line in column order', () => {
    assert.deepEqual(findLauncherViolations('npx --yes vite --host'), [
      { line: 1, column: 1, rule: 'downloading-package-run', excerpt: 'npx --yes vite --host' },
      { line: 1, column: 16, rule: 'non-loopback-host-bind', excerpt: 'npx --yes vite --host' },
    ]);
    assert.deepEqual(flaggedColumns('vite --host 0.0.0.0 && npx vite'), ['1:6', '1:24']);
  });
});
