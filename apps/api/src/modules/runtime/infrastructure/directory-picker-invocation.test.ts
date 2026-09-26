import { describe, expect, it } from 'vitest';

import {
  buildLinuxPickerInvocation,
  buildMacPickerInvocation,
  buildPickerInvocation,
  buildWindowsPickerInvocation,
  PathPickerUnsupportedError,
  PICKER_INITIAL_PATH_ENV,
} from './directory-picker-invocation.js';

const UTF8_OUTPUT_LINE = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8';
const HOSTILE_PATH = `D:/Модели’; Write-Output "INJECTED"; # it's $env:HOME;`;

function scriptOf(args: string[]): string {
  return args.at(-1) ?? '';
}

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

describe('buildLinuxPickerInvocation', () => {
  it('hands zenity the initial path as its own argument', () => {
    const { args, command } = buildLinuxPickerInvocation('/home/me/models', {});

    expect(command).toBe('zenity');
    expect(args).toEqual(['--file-selection', '--directory', '--filename=/home/me/models/']);
  });
});

describe('buildPickerInvocation', () => {
  it('reports the picker as unsupported on a platform without a dialog tool', () => {
    expect(() => buildPickerInvocation('freebsd', '', {})).toThrow(PathPickerUnsupportedError);
  });
});
