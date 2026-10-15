import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { classifyDeclarations } from './declaration-kinds.mjs';
import { parseRoleBaseline, serializeRoleBaseline } from './role-baseline-format.mjs';
import { compareWithBaseline, lowerBaseline } from './role-baseline-ratchet.mjs';
import { RoleGateError } from './role-gate-error.mjs';
import { describeOver, describeRule, describeStale } from './role-gate-report.mjs';
import { isRoleGatedFile } from './role-gated-file.mjs';
import { roleMix } from './role-mix.mjs';
import { listTrackedFiles } from './tracked-files.mjs';

const ABSENT_FILE_CODES = new Set(['ENOENT', 'ENOTDIR']);

function causeOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function readIfPresent(absolutePath, label) {
  try {
    return readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (ABSENT_FILE_CODES.has(error?.code)) return null;
    throw new RoleGateError(`${label} cannot be read: ${causeOf(error)}`);
  }
}

function readBaseline(baselinePath, label) {
  const text = readIfPresent(baselinePath, label);
  if (text === null) return null;
  try {
    return parseRoleBaseline(text);
  } catch (error) {
    if (!(error instanceof RoleGateError)) throw error;
    throw new RoleGateError(`${label} ${error.message}; fix it, or restore it with git checkout -- ${label}`);
  }
}

function claimTemporaryFile(temporary, label) {
  try {
    mkdirSync(path.dirname(temporary), { recursive: true });
    writeFileSync(temporary, '', { flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new RoleGateError(
        `${label}.tmp exists: another --update-baseline is running, or one stopped before replacing ${label}; ` +
          'delete it once no update runs',
      );
    }
    throw new RoleGateError(`${label} cannot be written: ${causeOf(error)}`);
  }
}

function replaceFromTemporaryFile(temporary, baselinePath, label, text) {
  try {
    writeFileSync(temporary, text);
    renameSync(temporary, baselinePath);
  } catch (error) {
    throw new RoleGateError(`${label} cannot be written: ${causeOf(error)}`);
  }
}

function updateBaseline(baselinePath, label, found) {
  const temporary = `${baselinePath}.tmp`;
  claimTemporaryFile(temporary, label);
  try {
    const baseline = lowerBaseline(found, readBaseline(baselinePath, label));
    replaceFromTemporaryFile(temporary, baselinePath, label, serializeRoleBaseline(baseline));
    return baseline;
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function scanRoleMixes(root) {
  const mixes = new Map();
  for (const file of listTrackedFiles(root).filter(isRoleGatedFile)) {
    const text = readIfPresent(path.join(root, file), file);
    if (text !== null) mixes.set(file, roleMix(classifyDeclarations(file, text)));
  }
  return mixes;
}

export function runFileRoleGate({ root, baselinePath, update, updateCommand }) {
  const label = path.relative(root, baselinePath).replaceAll(path.sep, '/');
  const mixes = scanRoleMixes(root);
  const found = new Map([...mixes].map(([file, mix]) => [file, mix?.signature ?? null]));
  const baseline = update
    ? updateBaseline(baselinePath, label, found)
    : (readBaseline(baselinePath, label) ?? new Map());

  const { over, stale } = compareWithBaseline(found, baseline);
  const lines = [
    ...over.flatMap((entry) => describeOver({ ...entry, members: mixes.get(entry.file).members }, label)),
    ...stale.flatMap((entry) => describeStale(entry, label, updateCommand)),
  ];
  if (over.length > 0) lines.push(describeRule(label));
  return { exitCode: lines.length > 0 ? 1 : 0, lines };
}
