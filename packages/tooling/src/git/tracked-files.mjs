import { execFileSync } from 'node:child_process';
import { TrackedFilesError } from './tracked-files-error.mjs';

const GIT_OUTPUT_LIMIT = 256 * 1024 * 1024;

export function listTrackedFiles(root) {
  try {
    return execFileSync('git', ['-C', root, 'ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: GIT_OUTPUT_LIMIT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\0')
      .filter(Boolean);
  } catch (error) {
    const detail = (typeof error?.stderr === 'string' && error.stderr.trim()) || String(error?.message ?? error);
    throw new TrackedFilesError(root, detail);
  }
}
