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

  it('reads a non-zero exit of the dialog tool as a cancel, the way zenity and osascript report one', async () => {
    answerPickerWith(Object.assign(new Error('Command failed'), { code: 1 }));

    await expect(pickNativeDirectory('', 'linux')).resolves.toBeNull();
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
