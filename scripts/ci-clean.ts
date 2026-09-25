import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type CommandOptions, runCommand, runCommandQuiet } from './run-command.ts';
import { CI_TEMP_DIRECTORY_PREFIX, removeStaleTempDirectories, removeTempDirectory } from './stale-temp-directories.ts';

const tempRoot = os.tmpdir();
const withoutHooks: CommandOptions = { env: { ...process.env, HUSKY: '0' } };

removeStaleTempDirectories(tempRoot, Date.now());
runCommand('git', ['worktree', 'prune'], withoutHooks);

const tempDir = mkdtempSync(path.join(tempRoot, CI_TEMP_DIRECTORY_PREFIX));
const inCheckout: CommandOptions = { ...withoutHooks, cwd: tempDir };

try {
  console.log(`[ci-clean] Creating clean worktree at ${tempDir}`);
  runCommand('git', ['worktree', 'add', '--detach', tempDir, 'HEAD'], withoutHooks);

  console.log('[ci-clean] Installing dependencies from lockfile in clean checkout...');
  runCommand('corepack', ['pnpm', 'install', '--frozen-lockfile'], inCheckout);

  console.log('[ci-clean] Running CI in clean checkout...');
  runCommand('npm', ['run', 'ci'], inCheckout);
} finally {
  console.log('[ci-clean] Removing temporary worktree...');
  removeTempDirectory(tempDir);
  const prune = runCommandQuiet('git', ['worktree', 'prune'], withoutHooks);
  if (prune.status !== 0) {
    console.warn(`[ci-clean] git worktree prune exited with ${prune.status}`, prune.error ?? prune.stderr.trim());
  }
}
