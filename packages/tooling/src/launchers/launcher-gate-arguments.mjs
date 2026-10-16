import { LauncherGateError } from './launcher-gate-error.mjs';

export function parseLauncherGateArguments(argv) {
  if (argv.length === 0) return { paths: null };
  if (argv[0] === '--') return { paths: argv.slice(1) };
  throw new LauncherGateError(
    `unknown argument ${argv[0]}; run without arguments for every tracked launcher, or pass -- and the paths to check`,
  );
}
