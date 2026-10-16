import { fileURLToPath } from 'node:url';
import { runLauncherGate } from './launcher-gate.mjs';
import { parseLauncherGateArguments } from './launcher-gate-arguments.mjs';
import { LauncherGateError } from './launcher-gate-error.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));

try {
  const { paths } = parseLauncherGateArguments(process.argv.slice(2));
  const { exitCode, lines } = runLauncherGate({ root, cwd: process.cwd(), paths });
  for (const line of lines) process.stderr.write(`${line}\n`);
  process.exitCode = exitCode;
} catch (error) {
  process.stderr.write(`${error instanceof LauncherGateError ? error.message : String(error?.stack ?? error)}\n`);
  process.exitCode = 2;
}
