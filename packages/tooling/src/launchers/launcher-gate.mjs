import path from 'node:path';
import { readTextIfPresent } from '../files/read-text-if-present.mjs';
import { listTrackedFilesForGate } from '../git/tracked-files-for-gate.mjs';
import { isLauncherFile } from './launcher-file.mjs';
import { LauncherGateError } from './launcher-gate-error.mjs';
import { describeViolation } from './launcher-report.mjs';
import { explainLauncherRule, findLauncherViolations } from './launcher-rules.mjs';

function toRepositoryPath(root, cwd, file) {
  return path.relative(root, path.resolve(cwd, file)).replaceAll(path.sep, '/');
}

export function runLauncherGate({ root, cwd, paths }) {
  const candidates =
    paths === null
      ? listTrackedFilesForGate(root, 'launcher gate', LauncherGateError)
      : paths.map((file) => toRepositoryPath(root, cwd, file));
  const lines = [];
  const brokenRules = new Set();
  for (const file of candidates.filter(isLauncherFile)) {
    const text = readTextIfPresent(path.resolve(root, file), file, LauncherGateError);
    if (text === null) continue;
    for (const violation of findLauncherViolations(text)) {
      lines.push(describeViolation(file, violation));
      brokenRules.add(violation.rule);
    }
  }
  for (const rule of brokenRules) lines.push(explainLauncherRule(rule));
  return { exitCode: lines.length > 0 ? 1 : 0, lines };
}
