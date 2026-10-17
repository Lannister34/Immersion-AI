import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUpdateBaselineArguments } from '../baseline/update-baseline-arguments.mjs';
import { runFileRoleGate } from './file-role-gate.mjs';
import { RoleGateError } from './role-gate-error.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const baselinePath = fileURLToPath(new URL('../../file-roles-baseline.json', import.meta.url));
const script = path.relative(root, fileURLToPath(import.meta.url)).replaceAll(path.sep, '/');

try {
  const { update } = parseUpdateBaselineArguments(process.argv.slice(2), RoleGateError);
  const { exitCode, lines } = runFileRoleGate({
    root,
    baselinePath,
    update,
    updateCommand: `node ${script} --update-baseline`,
  });
  for (const line of lines) process.stderr.write(`${line}\n`);
  process.exitCode = exitCode;
} catch (error) {
  process.stderr.write(`${error instanceof RoleGateError ? error.message : String(error?.stack ?? error)}\n`);
  process.exitCode = 2;
}
