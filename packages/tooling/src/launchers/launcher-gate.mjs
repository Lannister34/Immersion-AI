import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listTrackedFiles } from '../git/tracked-files.mjs';
import { TrackedFilesError } from '../git/tracked-files-error.mjs';
import { isLauncherFile } from './launcher-file.mjs';
import { LauncherGateError } from './launcher-gate-error.mjs';
import { describeLauncherRule, describeViolation } from './launcher-report.mjs';
import { findLauncherViolations } from './launcher-rules.mjs';

const ABSENT_FILE_CODES = new Set(['ENOENT', 'ENOTDIR']);

function listCandidates(root) {
  try {
    return listTrackedFiles(root);
  } catch (error) {
    if (!(error instanceof TrackedFilesError)) throw error;
    throw new LauncherGateError(
      `the launcher gate reads the tracked files of ${root}, and git failed: ${error.detail}`,
    );
  }
}

function toRepositoryPath(root, cwd, file) {
  return path.relative(root, path.resolve(cwd, file)).replaceAll(path.sep, '/');
}

function readIfPresent(root, file) {
  try {
    return readFileSync(path.resolve(root, file), 'utf8');
  } catch (error) {
    if (ABSENT_FILE_CODES.has(error?.code)) return null;
    throw new LauncherGateError(`${file} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function runLauncherGate({ root, cwd, paths }) {
  const candidates = paths === null ? listCandidates(root) : paths.map((file) => toRepositoryPath(root, cwd, file));
  const lines = [];
  for (const file of candidates.filter(isLauncherFile)) {
    const text = readIfPresent(root, file);
    if (text === null) continue;
    for (const violation of findLauncherViolations(text)) lines.push(describeViolation(file, violation));
  }
  if (lines.length > 0) lines.push(describeLauncherRule());
  return { exitCode: lines.length > 0 ? 1 : 0, lines };
}
