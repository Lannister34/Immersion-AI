import { typescript } from './repository-typescript.mjs';

const COMMAND_SEPARATOR = /&&|\|\||;/;
const BUILD_FLAGS = new Set(['-b', '--build']);
const TSC_WORD = /(^|[\\/])tsc(\.cmd|\.js)?$/i;

export const DEFAULT_PROJECT = 'tsconfig.json';

export class UnreadableTscCommandError extends Error {
  constructor(command, reason) {
    super(`cannot tell which program "${command}" runs: ${reason}`);
    this.name = 'UnreadableTscCommandError';
  }
}

function projectOf(command, argumentsAfterTsc) {
  if (BUILD_FLAGS.has(argumentsAfterTsc[0]?.toLowerCase())) {
    throw new UnreadableTscCommandError(command, 'build mode resolves references the gate does not follow');
  }

  const { errors, fileNames, options } = typescript.parseCommandLine(argumentsAfterTsc);

  if (errors.length > 0) {
    const reason = errors.map((error) => typescript.flattenDiagnosticMessageText(error.messageText, ' ')).join('; ');
    throw new UnreadableTscCommandError(command, reason);
  }
  if (fileNames.length > 0) {
    throw new UnreadableTscCommandError(command, `it compiles files, not a project: ${fileNames.join(', ')}`);
  }
  return options.project ?? DEFAULT_PROJECT;
}

export function tscProjects(script) {
  return script
    .split(COMMAND_SEPARATOR)
    .map((command) => command.trim())
    .filter(Boolean)
    .flatMap((command) => {
      const [executable, ...argumentsAfterTsc] = command.split(/\s+/);

      if (executable === 'tsc') {
        return [projectOf(command, argumentsAfterTsc)];
      }
      if ([executable, ...argumentsAfterTsc].some((word) => TSC_WORD.test(word))) {
        throw new UnreadableTscCommandError(command, 'tsc started through a launcher');
      }
      return [];
    });
}
