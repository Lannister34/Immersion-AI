import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../../../.husky/pre-push', import.meta.url));
const HOOK_EXPORTED_VARIABLES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
  'GIT_CONFIG_PARAMETERS',
];
const temporaryRoots = [];

function temporaryRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'immersion-pre-push-'));
  temporaryRoots.push(root);
  return root;
}

function isolatedGitEnvironment(root) {
  const globalConfig = path.join(root, 'gitconfig');
  writeFileSync(globalConfig, '');
  const inherited = Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'));

  return { ...Object.fromEntries(inherited), GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
}

function gitIn(cwd, env, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env });
}

function mustGitIn(cwd, env, ...args) {
  const result = gitIn(cwd, env, ...args);
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function createFixture({ npmExitCode = 0 } = {}) {
  const root = temporaryRoot();
  const work = path.join(root, 'work');
  const remote = path.join(root, 'remote.git');
  const hooks = path.join(root, 'hooks');
  const bin = path.join(root, 'bin');
  const npmLog = path.join(root, 'npm.log');
  const hookEnvironmentLog = path.join(root, 'hook-environment.log');

  mkdirSync(work);
  mkdirSync(hooks);
  mkdirSync(bin);
  writeFileSync(path.join(hooks, 'pre-push'), '#!/bin/sh\nexec sh -e "$PRE_PUSH_HOOK" "$@"\n', { mode: 0o755 });
  writeFileSync(
    path.join(bin, 'npm'),
    '#!/bin/sh\necho "$*" >> "$NPM_LOG"\nenv >> "$HOOK_ENVIRONMENT_LOG"\nexit "$NPM_EXIT_CODE"\n',
    { mode: 0o755 },
  );

  const env = {
    ...isolatedGitEnvironment(root),
    HOOK_ENVIRONMENT_LOG: hookEnvironmentLog,
    NPM_EXIT_CODE: String(npmExitCode),
    NPM_LOG: npmLog,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    PRE_PUSH_HOOK: HOOK,
  };

  const commitIn = (directory, fileName, content) => {
    writeFileSync(path.join(directory, fileName), content);
    mustGitIn(directory, env, 'add', fileName);
    mustGitIn(directory, env, 'commit', '-q', '-m', `add ${fileName}`);
  };

  mustGitIn(work, env, 'init', '-q', '-b', 'main');
  mustGitIn(work, env, 'config', 'user.name', 'Pre-push Test');
  mustGitIn(work, env, 'config', 'user.email', 'pre-push@example.test');
  commitIn(work, 'a.txt', 'a');
  mustGitIn(work, env, 'clone', '-q', '--bare', work, remote);
  mustGitIn(work, env, 'remote', 'add', 'origin', remote);
  mustGitIn(work, env, 'fetch', '-q', 'origin');
  mustGitIn(work, env, 'config', 'core.hooksPath', hooks);

  return {
    root,
    work,
    commit: (fileName, content) => commitIn(work, fileName, content),
    commitIn,
    git: (...args) => gitIn(work, env, ...args),
    gitIn: (directory, ...args) => gitIn(directory, env, ...args),
    mustGit: (...args) => mustGitIn(work, env, ...args),
    npmRuns: () => (existsSync(npmLog) ? readFileSync(npmLog, 'utf8').trim().split('\n') : []),
    hookEnvironment: () => (existsSync(hookEnvironmentLog) ? readFileSync(hookEnvironmentLog, 'utf8') : ''),
    remoteHead: (branch) => mustGitIn(remote, env, 'rev-parse', branch),
  };
}

function snapshotRepository(directory, env) {
  return {
    config: mustGitIn(directory, env, 'config', '--local', '--list'),
    refs: mustGitIn(directory, env, 'for-each-ref'),
    status: mustGitIn(directory, env, 'status', '--porcelain'),
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('the pre-push hook', () => {
  it('runs the fast checks and pushes when the pushed commit is the checked-out HEAD', () => {
    const fixture = createFixture();
    fixture.commit('b.txt', 'b');

    const push = fixture.git('push', '-q', 'origin', 'main');

    assert.equal(push.status, 0, push.stderr);
    assert.deepEqual(fixture.npmRuns(), ['run check:fast']);
    assert.equal(fixture.remoteHead('main'), fixture.mustGit('rev-parse', 'HEAD'));
  });

  it('refuses the push when the fast checks fail', () => {
    const fixture = createFixture({ npmExitCode: 1 });
    const before = fixture.remoteHead('main');
    fixture.commit('b.txt', 'b');

    const push = fixture.git('push', '-q', 'origin', 'main');

    assert.notEqual(push.status, 0);
    assert.equal(fixture.remoteHead('main'), before);
  });

  it('refuses a commit that is not checked out, since the checks would test another tree', () => {
    const fixture = createFixture();
    fixture.mustGit('switch', '-q', '-c', 'other');
    fixture.commit('b.txt', 'b');
    fixture.mustGit('switch', '-q', 'main');

    const push = fixture.git('push', '-q', 'origin', 'other');

    assert.notEqual(push.status, 0);
    assert.match(push.stderr, /from the worktree that has it checked out/u);
    assert.deepEqual(fixture.npmRuns(), []);
  });

  it('refuses a working tree with uncommitted changes', () => {
    const fixture = createFixture();
    fixture.commit('b.txt', 'b');
    writeFileSync(path.join(fixture.work, 'b.txt'), 'changed');

    const push = fixture.git('push', '-q', 'origin', 'main');

    assert.notEqual(push.status, 0);
    assert.match(push.stderr, /commit or stash/u);
    assert.deepEqual(fixture.npmRuns(), []);
  });

  it('refuses an untracked file even when the git config hides untracked files from status', () => {
    const fixture = createFixture();
    fixture.commit('b.txt', 'b');
    fixture.mustGit('config', 'status.showUntrackedFiles', 'no');
    writeFileSync(path.join(fixture.work, 'forgotten.txt'), 'never added');

    const push = fixture.git('push', '-q', 'origin', 'main');

    assert.notEqual(push.status, 0);
    assert.deepEqual(fixture.npmRuns(), []);
  });

  it('refuses the push when git cannot read the working tree state', () => {
    const fixture = createFixture();
    fixture.commit('b.txt', 'b');
    writeFileSync(path.join(fixture.work, '.git', 'index'), 'not an index');

    const push = fixture.git('push', '-q', 'origin', 'main');

    assert.notEqual(push.status, 0);
    assert.deepEqual(fixture.npmRuns(), []);
  });

  it('lets a branch deletion and an up-to-date push through without checks, even on a dirty tree', () => {
    const fixture = createFixture();
    fixture.mustGit('push', '-q', '--no-verify', 'origin', 'main:old');
    writeFileSync(path.join(fixture.work, 'scratch.txt'), 'work in progress');

    const deletion = fixture.git('push', '-q', 'origin', '--delete', 'old');
    const upToDate = fixture.git('push', '-q', 'origin', 'main');

    assert.equal(deletion.status, 0, deletion.stderr);
    assert.equal(upToDate.status, 0, upToDate.stderr);
    assert.deepEqual(fixture.npmRuns(), []);
  });

  it('clears what git exports to hooks from a linked worktree and from git -c before the checks', () => {
    const fixture = createFixture();
    const linked = path.join(fixture.root, 'linked');
    fixture.mustGit('worktree', 'add', '-q', '-b', 'feature', linked);
    fixture.commitIn(linked, 'b.txt', 'b');

    const push = fixture.gitIn(linked, '-c', 'core.abbrev=12', 'push', '-q', 'origin', 'feature');

    assert.equal(push.status, 0, push.stderr);
    assert.deepEqual(fixture.npmRuns(), ['run check:fast']);
    for (const variable of HOOK_EXPORTED_VARIABLES) {
      assert.doesNotMatch(fixture.hookEnvironment(), new RegExp(`^${variable}=`, 'mu'));
    }
  });

  it('keeps its own git commands out of the pushing repository that a hook GIT_DIR points at', () => {
    const sentinelRoot = temporaryRoot();
    const sentinelEnv = isolatedGitEnvironment(temporaryRoot());
    mustGitIn(sentinelRoot, sentinelEnv, 'init', '-q', '-b', 'main');
    writeFileSync(path.join(sentinelRoot, 'kept.txt'), 'kept');
    mustGitIn(sentinelRoot, sentinelEnv, 'add', 'kept.txt');
    mustGitIn(
      sentinelRoot,
      sentinelEnv,
      '-c',
      'user.name=Sentinel',
      '-c',
      'user.email=s@example.test',
      'commit',
      '-q',
      '-m',
      'sentinel',
    );
    const before = snapshotRepository(sentinelRoot, sentinelEnv);

    const inheritedGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(sentinelRoot, '.git');
    try {
      const fixture = createFixture();
      fixture.commit('b.txt', 'b');
      assert.equal(fixture.git('push', '-q', 'origin', 'main').status, 0);
    } finally {
      if (inheritedGitDir === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = inheritedGitDir;
      }
    }

    assert.deepEqual(snapshotRepository(sentinelRoot, sentinelEnv), before);
  });
});
