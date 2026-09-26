import type { PickerTool } from './directory-picker-outcome.js';

export const PICKER_INITIAL_PATH_ENV = 'IMMERSION_PICKER_INITIAL_PATH';

export class PathPickerUnsupportedError extends Error {
  constructor() {
    super('Native directory picker is not available on this platform.');
    this.name = 'PathPickerUnsupportedError';
  }
}

export interface PickerInvocation {
  args: string[];
  command: PickerTool;
  env: NodeJS.ProcessEnv;
}

const FOREGROUND_HELPER = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ImmersionForeground {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  public static void Claim(IntPtr hWnd) {
    uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint currentThread = GetCurrentThreadId();
    AttachThreadInput(foregroundThread, currentThread, true);
    BringWindowToTop(hWnd);
    SetForegroundWindow(hWnd);
    AttachThreadInput(foregroundThread, currentThread, false);
  }
}
"@
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.FormBorderStyle = 'None'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.StartPosition = 'Manual'
$owner.Location = New-Object System.Drawing.Point(-4000, -4000)
$owner.Show()
[ImmersionForeground]::Claim($owner.Handle)
`;

function withInitialPath(baseEnv: NodeJS.ProcessEnv, initialPath: string): NodeJS.ProcessEnv {
  const env = { ...baseEnv };

  delete env[PICKER_INITIAL_PATH_ENV];

  if (initialPath) {
    env[PICKER_INITIAL_PATH_ENV] = initialPath;
  }

  return env;
}

export function buildWindowsPickerInvocation(initialPath: string, baseEnv: NodeJS.ProcessEnv): PickerInvocation {
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    "$ErrorActionPreference = 'Stop'",
    FOREGROUND_HELPER,
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    `$initialPath = $env:${PICKER_INITIAL_PATH_ENV}`,
    'if ($initialPath) { $dialog.SelectedPath = $initialPath }',
    '$result = $dialog.ShowDialog($owner)',
    '$owner.Close()',
    "if ($result -eq 'OK') { $dialog.SelectedPath }",
  ].join('\n');

  return {
    args: ['-NoProfile', '-STA', '-Command', script],
    command: 'powershell',
    env: withInitialPath(baseEnv, initialPath),
  };
}

export function buildMacPickerInvocation(initialPath: string, baseEnv: NodeJS.ProcessEnv): PickerInvocation {
  const location = initialPath ? ` default location POSIX file (system attribute "${PICKER_INITIAL_PATH_ENV}")` : '';

  return {
    args: ['-e', `POSIX path of (choose folder${location})`],
    command: 'osascript',
    env: withInitialPath(baseEnv, initialPath),
  };
}

export function buildLinuxPickerInvocation(initialPath: string, baseEnv: NodeJS.ProcessEnv): PickerInvocation {
  const args = ['--file-selection', '--directory'];

  if (initialPath) {
    args.push(`--filename=${initialPath.endsWith('/') ? initialPath : `${initialPath}/`}`);
  }

  return { args, command: 'zenity', env: baseEnv };
}

export function buildPickerInvocation(
  platform: NodeJS.Platform,
  initialPath: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): PickerInvocation {
  if (platform === 'win32') {
    return buildWindowsPickerInvocation(initialPath, baseEnv);
  }

  if (platform === 'darwin') {
    return buildMacPickerInvocation(initialPath, baseEnv);
  }

  if (platform === 'linux') {
    return buildLinuxPickerInvocation(initialPath, baseEnv);
  }

  throw new PathPickerUnsupportedError();
}
