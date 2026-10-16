import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gitIn, isolatedGitEnvironment, mustGitIn } from './isolated-git.mjs';

const HOOK = fileURLToPath(new URL('../../../.husky/pre-commit', import.meta.url));
const BIOME_RUN = ['npx', '--no', 'biome', 'check', '--staged', '--no-errors-on-unmatched', '--error-on-warnings'];
const LAUNCHER_GATE = 'packages/tooling/src/launchers/check-launchers.mjs';
const temporaryRoots = [];

function createFixture({ failingTool = '' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'immersion-pre-commit-'));
  temporaryRoots.push(root);
  const work = path.join(root, 'work');
  const hooks = path.join(root, 'hooks');
  const bin = path.join(root, 'bin');
  const runLog = path.join(root, 'runs.log');

  mkdirSync(work);
  mkdirSync(hooks);
  mkdirSync(bin);
  writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nexec sh -e "$PRE_COMMIT_HOOK" "$@"\n', { mode: 0o755 });
  for (const program of ['npx', 'node']) {
    writeFileSync(
      path.join(bin, program),
      `#!/bin/sh\nprintf '%s|' ${program} >> "$RUN_LOG"\n` +
        'for arg in "$@"; do printf \'%s|\' "$arg"; done >> "$RUN_LOG"\necho >> "$RUN_LOG"\n' +
        'for arg in "$@"; do [ "$arg" != "$FAILING_TOOL" ] || exit 1; done\n',
      { mode: 0o755 },
    );
  }

  const env = {
    ...isolatedGitEnvironment(root),
    FAILING_TOOL: failingTool,
    RUN_LOG: runLog,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    PRE_COMMIT_HOOK: HOOK,
  };

  const write = (fileName, content) => {
    mkdirSync(path.dirname(path.join(work, fileName)), { recursive: true });
    writeFileSync(path.join(work, fileName), content);
  };
  const mustGit = (...args) => mustGitIn(work, env, ...args);

  mustGit('init', '-q', '-b', 'main');
  mustGit('config', 'user.name', 'Pre-commit Test');
  mustGit('config', 'user.email', 'pre-commit@example.test');
  write('kept.ts', 'export const kept = 1;\n');
  mustGit('add', 'kept.ts');
  mustGit('commit', '-q', '--no-verify', '-m', 'add kept.ts');
  mustGit('config', 'core.hooksPath', hooks);

  return {
    commit: () => gitIn(work, env, 'commit', '-q', '-m', 'change'),
    mustGit,
    runs: () =>
      existsSync(runLog)
        ? readFileSync(runLog, 'utf8')
            .trim()
            .split('\n')
            .map((line) => line.split('|').slice(0, -1))
        : [],
    write,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('the pre-commit hook', () => {
  it('runs Biome, then the comment gate and the launcher gate on the staged paths, never installing a tool', () => {
    const fixture = createFixture();
    fixture.write('src/a.ts', 'export const a = 1;\n');
    fixture.write('dir with space/b.ts', 'export const b = 2;\n');
    fixture.mustGit('add', '.');

    const commit = fixture.commit();

    assert.equal(commit.status, 0, commit.stderr);
    assert.deepEqual(fixture.runs(), [
      BIOME_RUN,
      ['npx', '--no', 'devkit-comments', '--', 'dir with space/b.ts', 'src/a.ts'],
      ['node', LAUNCHER_GATE, '--', 'dir with space/b.ts', 'src/a.ts'],
    ]);
  });

  it('refuses the commit when the comment gate fails', () => {
    const fixture = createFixture({ failingTool: 'devkit-comments' });
    fixture.write('a.ts', '// explains things\nexport const a = 1;\n');
    fixture.mustGit('add', 'a.ts');

    const commit = fixture.commit();

    assert.notEqual(commit.status, 0);
    assert.deepEqual(fixture.runs().at(-1), ['npx', '--no', 'devkit-comments', '--', 'a.ts']);
    assert.equal(fixture.mustGit('rev-list', '--count', 'HEAD'), '1');
  });

  it('refuses the commit when the launcher gate fails', () => {
    const fixture = createFixture({ failingTool: LAUNCHER_GATE });
    fixture.write('start.bat', 'call npx --yes concurrently\r\n');
    fixture.mustGit('add', 'start.bat');

    const commit = fixture.commit();

    assert.notEqual(commit.status, 0);
    assert.deepEqual(fixture.runs().at(-1), ['node', LAUNCHER_GATE, '--', 'start.bat']);
    assert.equal(fixture.mustGit('rev-list', '--count', 'HEAD'), '1');
  });

  it('refuses the commit when Biome fails, before the comment gate runs', () => {
    const fixture = createFixture({ failingTool: 'biome' });
    fixture.write('a.ts', 'export const a = 1;\n');
    fixture.mustGit('add', 'a.ts');

    const commit = fixture.commit();

    assert.notEqual(commit.status, 0);
    assert.deepEqual(fixture.runs(), [BIOME_RUN]);
  });

  it('scans a renamed file under its new path', () => {
    const fixture = createFixture();
    fixture.mustGit('mv', 'kept.ts', 'renamed.ts');

    const commit = fixture.commit();

    assert.equal(commit.status, 0, commit.stderr);
    assert.deepEqual(fixture.runs().slice(1), [
      ['npx', '--no', 'devkit-comments', '--', 'renamed.ts'],
      ['node', LAUNCHER_GATE, '--', 'renamed.ts'],
    ]);
  });

  it('skips the comment gate and the launcher gate when the commit only deletes files', () => {
    const fixture = createFixture();
    fixture.mustGit('rm', '-q', 'kept.ts');

    const commit = fixture.commit();

    assert.equal(commit.status, 0, commit.stderr);
    assert.deepEqual(fixture.runs(), [BIOME_RUN]);
  });
});
