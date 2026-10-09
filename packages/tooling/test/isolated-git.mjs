import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export function isolatedGitEnvironment(root) {
  const globalConfig = path.join(root, 'gitconfig');
  writeFileSync(globalConfig, '');
  const inherited = Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'));

  return { ...Object.fromEntries(inherited), GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
}

export function gitIn(cwd, env, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env });
}

export function mustGitIn(cwd, env, ...args) {
  const result = gitIn(cwd, env, ...args);
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}
