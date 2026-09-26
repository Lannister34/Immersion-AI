import type { ExecFileException, ExecFileOptions } from 'node:child_process';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildMacPickerInvocation,
  buildWindowsPickerInvocation,
  PathPickerUnsupportedError,
  PICKER_INITIAL_PATH_ENV,
  pickNativeDirectory,
} from './native-directory-picker.js';

interface ExecFileResult {
  stderr: string;
  stdout: string;
}

type ExecFileCallback = (error: ExecFileException | null, result?: ExecFileResult) => void;

type ExecFileWithCallback = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
  callback: ExecFileCallback,
) => void;

const execFileMock = vi.hoisted(() => vi.fn<ExecFileWithCallback>());

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

const UTF8_OUTPUT_LINE = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8';
const HOSTILE_PATH = `D:/Модели’; Write-Output "INJECTED"; # it's $env:HOME;`;

function answerPickerWith(error: ExecFileException | null, stdout = '') {
  execFileMock.mockImplementation((_file, _args, _options, callback) => {
    callback(error, error ? undefined : { stderr: '', stdout });
  });
}

function scriptOf(args: string[]): string {
  return args.at(-1) ?? '';
}

function exitWith(code: number): ExecFileException {
  return Object.assign(new Error(`Command failed with exit code ${code}`), { code });
}

beforeEach(() => {
  execFileMock.mockReset();
});

describe('buildWindowsPickerInvocation', () => {
  it('keeps the initial path out of the script text and passes it through the environment', () => {
    const { args, env } = buildWindowsPickerInvocation(HOSTILE_PATH, {});
    const script = scriptOf(args);

    expect(script).not.toContain(HOSTILE_PATH);
    expect(script).not.toContain('INJECTED');
    expect(script).not.toContain('’');
    expect(script).toContain(`$env:${PICKER_INITIAL_PATH_ENV}`);
    expect(env[PICKER_INITIAL_PATH_ENV]).toBe(HOSTILE_PATH);
  });

  it('forces UTF-8 output first, because Windows PowerShell writes the console code page to a pipe', () => {
    const script = scriptOf(buildWindowsPickerInvocation('D:/Модели', {}).args);

    expect(script.split('\n')[0]).toBe(UTF8_OUTPUT_LINE);
  });

  it('stops the script at its first error, so a failed dialog exits non-zero instead of printing nothing', () => {
    const script = scriptOf(buildWindowsPickerInvocation('', {}).args);

    expect(script.split('\n')[1]).toBe("$ErrorActionPreference = 'Stop'");
  });

  it('drops a stale initial path from the inherited environment when none is given', () => {
    const { env } = buildWindowsPickerInvocation('', { [PICKER_INITIAL_PATH_ENV]: 'D:/stale', PATH: '/bin' });

    expect(env).toEqual({ PATH: '/bin' });
  });
});

describe('buildMacPickerInvocation', () => {
  it('keeps the initial path out of the AppleScript and reads it from the environment', () => {
    const hostilePath = '/Users/me/Модели”; do shell script "touch /tmp/pwned"';
    const { args, command, env } = buildMacPickerInvocation(hostilePath, {});
    const script = scriptOf(args);

    expect(command).toBe('osascript');
    expect(script).not.toContain(hostilePath);
    expect(script).not.toContain('pwned');
    expect(script).toContain(`system attribute "${PICKER_INITIAL_PATH_ENV}"`);
    expect(env[PICKER_INITIAL_PATH_ENV]).toBe(hostilePath);
  });

  it('opens at the default location without reading the environment when no initial path is given', () => {
    const { args } = buildMacPickerInvocation('', {});

    expect(scriptOf(args)).toBe('POSIX path of (choose folder)');
  });
});

describe('pickNativeDirectory', () => {
  it('returns the directory the dialog printed', async () => {
    answerPickerWith(null, 'D:\\models\n');

    await expect(pickNativeDirectory('', 'win32')).resolves.toBe('D:\\models');
  });

  it('hands the Windows dialog its initial path through the environment, never the command line', async () => {
    answerPickerWith(null, 'D:\\models\n');

    await pickNativeDirectory(HOSTILE_PATH, 'win32');

    const [command, args, options] = execFileMock.mock.calls[0] ?? [];

    expect(command).toBe('powershell');
    expect(args?.some((argument) => argument.includes(HOSTILE_PATH))).toBe(false);
    expect(options?.env?.[PICKER_INITIAL_PATH_ENV]).toBe(HOSTILE_PATH);
  });

  it('hands zenity the initial path as its own argument', async () => {
    answerPickerWith(null, '/models\n');

    await pickNativeDirectory('/home/me/models', 'linux');

    const [command, args] = execFileMock.mock.calls[0] ?? [];

    expect(command).toBe('zenity');
    expect(args).toEqual(['--file-selection', '--directory', '--filename=/home/me/models/']);
  });

  it('reads exit code 1 as a cancel on Linux and macOS, the way zenity and osascript report one', async () => {
    answerPickerWith(exitWith(1));

    await expect(pickNativeDirectory('', 'linux')).resolves.toBeNull();
    await expect(pickNativeDirectory('', 'darwin')).resolves.toBeNull();
  });

  it('reads empty output as a cancel on Windows, where the script prints nothing for a closed dialog', async () => {
    answerPickerWith(null, '\r\n');

    await expect(pickNativeDirectory('', 'win32')).resolves.toBeNull();
  });

  it('reports a failed PowerShell script on Windows instead of treating it as a cancel', async () => {
    answerPickerWith(exitWith(1));

    await expect(pickNativeDirectory('', 'win32')).rejects.toThrow('exit code 1');
  });

  it('reports a dialog tool that exited with another code instead of treating it as a cancel', async () => {
    answerPickerWith(exitWith(255));

    await expect(pickNativeDirectory('', 'linux')).rejects.toThrow('exit code 255');
  });

  it('reports a dialog killed by the timeout instead of treating it as a cancel', async () => {
    answerPickerWith(
      Object.assign(new Error('Command failed: zenity'), { code: null, killed: true, signal: 'SIGTERM' as const }),
    );

    await expect(pickNativeDirectory('', 'linux')).rejects.toThrow('Command failed: zenity');
  });

  it('reports a dialog tool that exited without printing a path on Linux instead of treating it as a cancel', async () => {
    answerPickerWith(null, '');

    await expect(pickNativeDirectory('', 'linux')).rejects.toThrow('without printing a path');
  });

  it('reports the picker as unsupported when the dialog tool is not installed', async () => {
    answerPickerWith(Object.assign(new Error('spawn zenity ENOENT'), { code: 'ENOENT' }));

    await expect(pickNativeDirectory('', 'linux')).rejects.toBeInstanceOf(PathPickerUnsupportedError);
  });

  it('reports the picker as unsupported on a platform without a dialog tool, before spawning anything', async () => {
    await expect(pickNativeDirectory('', 'freebsd')).rejects.toBeInstanceOf(PathPickerUnsupportedError);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
