import type { ExecFileException, ExecFileOptions } from 'node:child_process';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PathPickerUnsupportedError, PICKER_INITIAL_PATH_ENV } from './directory-picker-invocation.js';
import { pickNativeDirectory } from './native-directory-picker.js';

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

const HOSTILE_PATH = `D:/Модели’; Write-Output "INJECTED"; # it's $env:HOME;`;

function answerPickerWith(error: ExecFileException | null, stdout = '') {
  execFileMock.mockImplementation((_file, _args, _options, callback) => {
    callback(error, error ? undefined : { stderr: '', stdout });
  });
}

function exitWith(code: number, stderr = ''): ExecFileException {
  return Object.assign(new Error(`Command failed with exit code ${code}`), { code, stderr });
}

beforeEach(() => {
  execFileMock.mockReset();
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

  it('reads empty output as a cancel on Windows, where the script prints nothing for a closed dialog', async () => {
    answerPickerWith(null, '\r\n');

    await expect(pickNativeDirectory('', 'win32')).resolves.toBeNull();
  });

  it('reports a failed PowerShell script on Windows instead of treating it as a cancel', async () => {
    answerPickerWith(exitWith(1));

    await expect(pickNativeDirectory('', 'win32')).rejects.toThrow('exit code 1');
  });

  it('reads a user cancel on macOS as a cancel and any other AppleScript error as a failure', async () => {
    answerPickerWith(exitWith(1, 'execution error: User canceled. (-128)'));
    await expect(pickNativeDirectory('', 'darwin')).resolves.toBeNull();

    answerPickerWith(exitWith(1, 'execution error: Can’t make file. (-1700)'));
    await expect(pickNativeDirectory('', 'darwin')).rejects.toThrow('exit code 1');
  });

  it('reads the zenity cancel button as a cancel', async () => {
    answerPickerWith(exitWith(1));

    await expect(pickNativeDirectory('', 'linux')).resolves.toBeNull();
  });

  it('reports the picker as unsupported when zenity cannot open a display, in either GTK wording', async () => {
    answerPickerWith(exitWith(1, 'Gtk-WARNING **: cannot open display: :0'));
    await expect(pickNativeDirectory('', 'linux')).rejects.toBeInstanceOf(PathPickerUnsupportedError);

    answerPickerWith(exitWith(1, 'Gtk-WARNING **: 12:00:00: Failed to open display'));
    await expect(pickNativeDirectory('', 'linux')).rejects.toBeInstanceOf(PathPickerUnsupportedError);
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
