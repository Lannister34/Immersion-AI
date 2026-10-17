import path from 'node:path';
import { BaselineFile } from '../baseline/baseline-file.mjs';
import { countBaselineCodec } from '../baseline/count-baseline-format.mjs';
import { compareWithBaseline, lowerBaseline } from '../baseline/count-baseline-ratchet.mjs';
import { readTextIfPresent } from '../files/read-text-if-present.mjs';
import { listTrackedFilesForGate } from '../git/tracked-files-for-gate.mjs';
import { classifyDeclarations } from './declaration-kinds.mjs';
import { RoleGateError } from './role-gate-error.mjs';
import { describeOver, describeRule, describeStale } from './role-gate-report.mjs';
import { isRoleGatedFile } from './role-gated-file.mjs';
import { SIGNATURE_KINDS } from './role-kinds.mjs';
import { roleMix } from './role-mix.mjs';

const BASELINE_CODEC = countBaselineCodec({
  keys: SIGNATURE_KINDS,
  entry: 'a role signature',
  example: 'class:1 function:2',
  GateError: RoleGateError,
});

function scanRoleMixes(root) {
  const mixes = new Map();
  for (const file of listTrackedFilesForGate(root, 'file-role gate', RoleGateError).filter(isRoleGatedFile)) {
    const text = readTextIfPresent(path.join(root, file), file, RoleGateError);
    if (text !== null) mixes.set(file, roleMix(classifyDeclarations(file, text)));
  }
  return mixes;
}

export function runFileRoleGate({ root, baselinePath, update, updateCommand }) {
  const label = path.relative(root, baselinePath).replaceAll(path.sep, '/');
  const mixes = scanRoleMixes(root);
  const found = new Map([...mixes].map(([file, mix]) => [file, mix?.signature ?? null]));
  const baselineFile = new BaselineFile({ path: baselinePath, label, codec: BASELINE_CODEC, GateError: RoleGateError });
  const baseline = update
    ? baselineFile.lower((current) => lowerBaseline(found, current))
    : (baselineFile.read() ?? new Map());

  const { over, stale } = compareWithBaseline(found, baseline);
  const lines = [
    ...over.flatMap((entry) => describeOver({ ...entry, members: mixes.get(entry.file).members }, label)),
    ...stale.flatMap((entry) => describeStale(entry, label, updateCommand)),
  ];
  if (over.length > 0) lines.push(describeRule(label));
  return { exitCode: lines.length > 0 ? 1 : 0, lines };
}
