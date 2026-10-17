import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUpdateBaselineArguments } from '../baseline/update-baseline-arguments.mjs';
import { runSignatureGate } from './signature-gate.mjs';
import { SignatureGateError } from './signature-gate-error.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const baselinePath = fileURLToPath(new URL('../../signature-baseline.json', import.meta.url));
const script = path.relative(root, fileURLToPath(import.meta.url)).replaceAll(path.sep, '/');

try {
  const { update } = parseUpdateBaselineArguments(process.argv.slice(2), SignatureGateError);
  const { exitCode, lines } = runSignatureGate({
    root,
    baselinePath,
    update,
    updateCommand: `node ${script} --update-baseline`,
  });
  for (const line of lines) process.stderr.write(`${line}\n`);
  process.exitCode = exitCode;
} catch (error) {
  process.stderr.write(`${error instanceof SignatureGateError ? error.message : String(error?.stack ?? error)}\n`);
  process.exitCode = 2;
}
