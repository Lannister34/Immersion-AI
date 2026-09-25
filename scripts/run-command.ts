import { type SpawnSyncOptions, spawnSync } from 'node:child_process';

export interface ResolvedCommand {
  readonly file: string;
  readonly args: readonly string[];
  readonly windowsVerbatimArguments: boolean;
}

export interface CommandOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface QuietCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}

export class CommandFailedError extends Error {
  readonly status: number | null;

  constructor(commandLine: string, status: number | null) {
    super(`${commandLine} exited with ${status ?? 'no status'}`);
    this.name = 'CommandFailedError';
    this.status = status;
  }
}

export function quoteWindowsArg(arg: string): string {
  if (!arg.length) {
    return '""';
  }

  if (!/[\s"]/u.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

export function resolveCommand(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
): ResolvedCommand {
  if (platform !== 'win32') {
    return { file: command, args, windowsVerbatimArguments: false };
  }

  const commandLine = [command, ...args].map(quoteWindowsArg).join(' ');

  return {
    file: 'cmd.exe',
    args: ['/d', '/s', '/c', `"${commandLine}"`],
    windowsVerbatimArguments: true,
  };
}

export function runCommand(command: string, args: readonly string[], options: CommandOptions = {}): void {
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.file, resolved.args, { ...spawnOptionsFor(resolved, options), stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new CommandFailedError([command, ...args].join(' '), result.status);
  }
}

export function runCommandQuiet(
  command: string,
  args: readonly string[],
  options: CommandOptions = {},
): QuietCommandResult {
  const resolved = resolveCommand(command, args);
  const result = spawnSync(resolved.file, resolved.args, {
    ...spawnOptionsFor(resolved, options),
    stdio: 'pipe',
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function spawnOptionsFor(resolved: ResolvedCommand, options: CommandOptions): SpawnSyncOptions {
  return {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    windowsVerbatimArguments: resolved.windowsVerbatimArguments,
  };
}
