import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function quoteWindowsArg(arg) {
  if (!arg.length) {
    return '""';
  }

  if (!/[\s"]/u.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function resolveCommand(command, args) {
  if (process.platform !== 'win32') {
    return { command, args };
  }

  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', [command, ...args].map(quoteWindowsArg).join(' ')],
  };
}

function run(command, args, options = {}) {
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.command, resolved.args, {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      HUSKY: '0',
    },
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? 1}`);
  }
}

function runQuiet(command, args, options = {}) {
  const resolved = resolveCommand(command, args);

  return spawnSync(resolved.command, resolved.args, {
    stdio: 'pipe',
    shell: false,
    env: {
      ...process.env,
      HUSKY: '0',
    },
    encoding: 'utf8',
    ...options,
  });
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'immersion-ci-'));
let worktreeAdded = false;

try {
  console.log(`[ci-clean] Creating clean worktree at ${tempDir}`);
  run('git', ['worktree', 'add', '--detach', tempDir, 'HEAD']);
  worktreeAdded = true;

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  console.log('[ci-clean] Installing dependencies from lockfile in clean checkout...');
  run('corepack', ['pnpm', 'install', '--frozen-lockfile'], { cwd: tempDir });

  console.log('[ci-clean] Running CI in clean checkout...');
  run(npm, ['run', 'ci'], { cwd: tempDir });
} finally {
  if (worktreeAdded) {
  console.log('[ci-clean] Removing temporary worktree...');
    const removal = runQuiet('git', ['worktree', 'remove', tempDir, '--force']);
    if (removal.status !== 0) {
      rmSync(tempDir, { force: true, recursive: true });
      runQuiet('git', ['worktree', 'prune']);
    }
  } else {
    rmSync(tempDir, { force: true, recursive: true });
  }
}
