import { readCommandArguments } from './command-arguments.mjs';

const NAME_BEFORE = String.raw`[\w.@:-]`;
const NAME_AFTER = String.raw`[\w.@/\\:-]`;
const SHIM = String.raw`(?:\.(?:cmd|exe|ps1))?`;
const ARGUMENT_GAP = String.raw`[ \t]+`;
const INSTALL_ANSWERS = new Set(['--yes', '--yes=true', '-y']);

const runsOnlyInstalled = (refusals) => {
  const refuses = new Set([...refusals, '--no-yes', '--yes=false']);
  return ({ options }) => {
    const answers = options.filter((option) => refuses.has(option) || INSTALL_ANSWERS.has(option));
    return refuses.has(answers.at(-1));
  };
};
const initialisesInPlace = ({ positional }) => positional === null;
const alwaysDownloads = () => false;

const PACKAGE_RUNS = [
  { command: `npx${SHIM}`, accepts: runsOnlyInstalled(['--no', '--no-install']) },
  { command: `npm${SHIM}${ARGUMENT_GAP}(?:exec|x)`, accepts: runsOnlyInstalled(['--no']) },
  { command: `npm${SHIM}${ARGUMENT_GAP}init`, accepts: initialisesInPlace },
  { command: `(?:npm|pnpm|yarn)${SHIM}${ARGUMENT_GAP}create`, accepts: alwaysDownloads },
  { command: `(?:pnpm|yarn)${SHIM}${ARGUMENT_GAP}dlx`, accepts: alwaysDownloads },
  { command: `bun${SHIM}${ARGUMENT_GAP}x`, accepts: alwaysDownloads },
  { command: `(?:pnpx|bunx)${SHIM}`, accepts: alwaysDownloads },
];

const COMMAND = new RegExp(
  `(?<!${NAME_BEFORE})(?:${PACKAGE_RUNS.map(({ command }) => `(${command})`).join('|')})(?!${NAME_AFTER})`,
  'gi',
);

function runOf(match) {
  return PACKAGE_RUNS[match.slice(1).findIndex((group) => group !== undefined)];
}

export const downloadingPackageRun = {
  name: 'downloading-package-run',
  explanation:
    'A launcher runs only what the lockfile installed. npx, npm exec and npm x without --no, or with --yes, ' +
    'npm init with a package, npm, pnpm and yarn create, pnpm and yarn dlx, pnpx, bunx and bun x fetch ' +
    'whatever version the registry serves. Add the tool as a pinned devDependency and run it through ' +
    'npx --no, pnpm exec or a package script.',
  find(line) {
    const offsets = [];
    for (const match of line.matchAll(COMMAND)) {
      const parsed = readCommandArguments(line, match.index + match[0].length);
      if (!runOf(match).accepts(parsed)) offsets.push(match.index);
    }
    return offsets;
  },
};
