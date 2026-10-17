import path from 'node:path';
import { BaselineFile } from '../baseline/baseline-file.mjs';
import { countBaselineCodec } from '../baseline/count-baseline-format.mjs';
import { compareWithBaseline, lowerBaseline } from '../baseline/count-baseline-ratchet.mjs';
import { readTextIfPresent } from '../files/read-text-if-present.mjs';
import { listTrackedFilesForGate } from '../git/tracked-files-for-gate.mjs';
import { findSignatureViolations } from './find-signature-violations.mjs';
import { SignatureGateError } from './signature-gate-error.mjs';
import { describeOver, describeRules, describeStale } from './signature-gate-report.mjs';
import { SIGNATURE_RULES } from './signature-rules.mjs';
import { signatureScopeOf } from './signature-scope.mjs';

const BASELINE_CODEC = countBaselineCodec({
  keys: new Set(SIGNATURE_RULES.map(({ id }) => id)),
  entry: 'a list of rule counts',
  example: 'explicit-return-type:2',
  GateError: SignatureGateError,
});

function scanViolations(root) {
  const violations = new Map();
  for (const file of listTrackedFilesForGate(root, 'signature gate', SignatureGateError)) {
    const scope = signatureScopeOf(file);
    if (scope === null) continue;
    const text = readTextIfPresent(path.join(root, file), file, SignatureGateError);
    if (text !== null) violations.set(file, findSignatureViolations(file, text, scope));
  }
  return violations;
}

function countByRule(violations) {
  if (violations.length === 0) return null;
  const counts = {};
  for (const { rule } of violations) counts[rule] = (counts[rule] ?? 0) + 1;
  return counts;
}

export function runSignatureGate({ root, baselinePath, update, updateCommand }) {
  const label = path.relative(root, baselinePath).replaceAll(path.sep, '/');
  const violations = scanViolations(root);
  const found = new Map([...violations].map(([file, list]) => [file, countByRule(list)]));
  const baselineFile = new BaselineFile({
    path: baselinePath,
    label,
    codec: BASELINE_CODEC,
    GateError: SignatureGateError,
  });
  const baseline = update
    ? baselineFile.lower((current) => lowerBaseline(found, current))
    : (baselineFile.read() ?? new Map());

  const { over, stale } = compareWithBaseline(found, baseline);
  const exceeded = new Set(over.flatMap((entry) => entry.exceeded));
  const lines = [];
  for (const entry of over) {
    const shown = violations.get(entry.file).filter(({ rule }) => entry.exceeded.includes(rule));
    lines.push(...describeOver({ ...entry, violations: shown }, label));
  }
  for (const entry of stale) lines.push(...describeStale(entry, label, updateCommand));
  if (over.length > 0) lines.push(...describeRules(exceeded, label));
  return { exitCode: lines.length > 0 ? 1 : 0, lines };
}
