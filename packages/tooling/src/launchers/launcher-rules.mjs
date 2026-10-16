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

export function findLauncherViolations(text) {
  const violations = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    for (const match of line.matchAll(COMMAND)) {
      const parsed = readCommandArguments(line, match.index + match[0].length);
      if (runOf(match).accepts(parsed)) continue;
      violations.push({
        line: index + 1,
        column: match.index + 1,
        rule: 'downloading-package-run',
        excerpt: line.trim(),
      });
    }
  }
  return violations;
}
