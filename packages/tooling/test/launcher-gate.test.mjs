import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isLauncherFile } from '../src/launchers/launcher-file.mjs';
import { runLauncherGate } from '../src/launchers/launcher-gate.mjs';
import { parseLauncherGateArguments } from '../src/launchers/launcher-gate-arguments.mjs';
import { LauncherGateError } from '../src/launchers/launcher-gate-error.mjs';
import { isolatedGitEnvironment, mustGitIn } from './isolated-git.mjs';

const TOOLING_SOURCES = fileURLToPath(new URL('../src', import.meta.url));
const DOWNLOADING_RUN = 'call npx --yes concurrently\r\n';
const temporaryRoots = [];

function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), 'immersion-launchers-'));
  temporaryRoots.push(root);
  const work = path.join(root, 'work');
  mkdirSync(work);
  const env = isolatedGitEnvironment(root);
  mustGitIn(work, env, 'init', '-q', '-b', 'main');

  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    writeFileSync(path.join(work, file), content);
  };
  const track = (file, content) => {
    write(file, content);
    mustGitIn(work, env, 'add', '--', file);
  };
  const installCli = () => {
    cpSync(TOOLING_SOURCES, path.join(work, 'packages/tooling/src'), { recursive: true });
    const cli = path.join(work, 'packages/tooling/src/launchers/check-launchers.mjs');
    return (args, cwd = root) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env });
  };

  return { installCli, root, track, work, write };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('launcher files', () => {
  it('covers the scripts, hooks, manifests, root configs and workflows that start a program', () => {
    const launchers = [
      'start.bat',
      'setup-llama.bat',
      'tools/run.CMD',
      'scripts/install-llama.ps1',
      'scripts/release.sh',
      '.husky/pre-commit',
      '.husky/commit-msg',
      'package.json',
      'apps/api/package.json',
      'ecosystem.config.cjs',
      '.github/workflows/ci.yml',
      '.github/workflows/release.yaml',
    ];
    const others = [
      'README.md',
      '.husky/_/husky.sh.md',
      'apps/api/package.json.bak',
      'apps/api/vitest.config.cjs',
      'apps/api/src/server.ts',
      '.github/ISSUE_TEMPLATE/bug-report.yml',
      'pnpm-lock.yaml',
    ];

    assert.deepEqual(
      launchers.filter((file) => !isLauncherFile(file)),
      [],
    );
    assert.deepEqual(others.filter(isLauncherFile), []);
  });
});

describe('launcher gate arguments', () => {
  it('checks every tracked launcher without arguments, and only the paths after --', () => {
    assert.deepEqual(parseLauncherGateArguments([]), { paths: null });
    assert.deepEqual(parseLauncherGateArguments(['--', 'start.bat', 'a b/package.json']), {
      paths: ['start.bat', 'a b/package.json'],
    });
    assert.deepEqual(parseLauncherGateArguments(['--']), { paths: [] });
  });

  it('refuses an unknown argument instead of checking nothing', () => {
    assert.throws(() => parseLauncherGateArguments(['--staged']), LauncherGateError);
    assert.throws(() => parseLauncherGateArguments(['start.bat']), LauncherGateError);
  });
});

describe('the launcher gate', () => {
  it('passes a repository whose launchers run only installed tools', () => {
    const repository = createRepository();
    repository.track('start.bat', '@echo off\r\ncall corepack pnpm install --frozen-lockfile\r\n');
    repository.track('.husky/commit-msg', 'npx --no -- commitlint --edit "$1"\n');

    assert.deepEqual(runLauncherGate({ root: repository.work, cwd: repository.work, paths: null }), {
      exitCode: 0,
      lines: [],
    });
  });

  it('reports each downloading run of a tracked launcher with its path, line and column', () => {
    const repository = createRepository();
    repository.track('start.bat', `@echo off\r\n${DOWNLOADING_RUN}`);
    repository.track('apps/web/package.json', '{\n  "scripts": { "dev": "pnpm dlx vite" }\n}\n');
    repository.track('docs/notes.md', DOWNLOADING_RUN);
    repository.write('untracked.bat', DOWNLOADING_RUN);

    const { exitCode, lines } = runLauncherGate({ root: repository.work, cwd: repository.work, paths: null });

    assert.equal(exitCode, 1);
    assert.deepEqual(lines.slice(0, -1), [
      'apps/web/package.json:2:24: downloading-package-run: "scripts": { "dev": "pnpm dlx vite" }',
      'start.bat:2:6: downloading-package-run: call npx --yes concurrently',
    ]);
    assert.match(lines.at(-1), /runs only what the lockfile installed/);
  });

  it('checks only the launchers among the given paths, read from the working tree, and skips a deleted one', () => {
    const repository = createRepository();
    repository.track('start.bat', '@echo off\r\n');
    repository.write('start.bat', DOWNLOADING_RUN);
    repository.write('запуск с пробелом.cmd', DOWNLOADING_RUN);
    repository.write('notes.md', DOWNLOADING_RUN);
    repository.write('other.bat', DOWNLOADING_RUN);
    repository.write('nested/run.sh', DOWNLOADING_RUN);

    const { lines } = runLauncherGate({
      root: repository.work,
      cwd: repository.work,
      paths: [
        'start.bat',
        'запуск с пробелом.cmd',
        'notes.md',
        'gone.bat',
        path.join(repository.work, 'nested', 'run.sh'),
      ],
    });

    assert.deepEqual(lines.slice(0, -1), [
      'start.bat:1:6: downloading-package-run: call npx --yes concurrently',
      'запуск с пробелом.cmd:1:6: downloading-package-run: call npx --yes concurrently',
      'nested/run.sh:1:6: downloading-package-run: call npx --yes concurrently',
    ]);
  });

  it('reads a relative path from the directory the gate runs in, not from the repository root', () => {
    const repository = createRepository();
    repository.write('package.json', '{ "scripts": { "dev": "pnpm --filter web dev" } }\n');
    repository.write('apps/web/package.json', '{ "scripts": { "dev": "npx vite" } }\n');

    const { lines } = runLauncherGate({
      root: repository.work,
      cwd: path.join(repository.work, 'apps/web'),
      paths: ['package.json', '../../package.json'],
    });

    assert.deepEqual(lines.slice(0, -1), [
      'apps/web/package.json:1:24: downloading-package-run: { "scripts": { "dev": "npx vite" } }',
    ]);
  });

  it('refuses to scan when git cannot list the tracked files', () => {
    const repository = createRepository();
    const missing = path.join(repository.root, 'missing');

    assert.throws(
      () => runLauncherGate({ root: missing, cwd: missing, paths: null }),
      (error) =>
        error instanceof LauncherGateError &&
        error.message.startsWith(`the launcher gate reads the tracked files of ${missing}, and git failed: `),
    );
  });

  it('refuses a launcher it cannot read instead of passing it', () => {
    const repository = createRepository();
    mkdirSync(path.join(repository.work, 'folder.bat'));

    assert.throws(
      () => runLauncherGate({ root: repository.work, cwd: repository.work, paths: ['folder.bat'] }),
      (error) => error instanceof LauncherGateError && error.message.startsWith('folder.bat cannot be read: '),
    );
  });

  it('exits 1 from the command line on a violation, 0 on a clean tree, 2 on a fault', () => {
    const repository = createRepository();
    const cli = repository.installCli();
    repository.track('start.bat', DOWNLOADING_RUN);

    const failing = cli([]);
    assert.equal(failing.status, 1);
    assert.equal(failing.stderr.split('\n')[0], 'start.bat:1:6: downloading-package-run: call npx --yes concurrently');

    repository.track('start.bat', 'call corepack pnpm --parallel --filter @immersion/api run dev\r\n');
    const passing = cli([]);
    assert.equal(passing.status, 0, passing.stderr);
    assert.equal(cli(['--', 'start.bat'], repository.work).status, 0);
    repository.write('apps/web/package.json', '{ "scripts": { "dev": "npx vite" } }\n');
    assert.equal(cli(['--', 'package.json'], path.join(repository.work, 'apps/web')).status, 1);

    const fault = cli(['--staged']);
    assert.equal(fault.status, 2);
    assert.match(fault.stderr, /^unknown argument --staged/);
  });
});
