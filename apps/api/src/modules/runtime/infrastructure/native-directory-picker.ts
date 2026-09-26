import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PICKER_TIMEOUT_MS = 5 * 60 * 1000;

export class PathPickerUnsupportedError extends Error {
  constructor() {
    super('Native directory picker is not available on this platform.');
    this.name = 'PathPickerUnsupportedError';
  }
}

function quotePowerShell(value: string): string {
  return value.replace(/'/gu, "''");
}

function quoteAppleScript(value: string): string {
  return value.replace(/(["\\])/gu, '\\$1');
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

async function pickOnWindows(initialPath: string): Promise<string | null> {
  const script = [
    FOREGROUND_HELPER,
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    initialPath ? `$dialog.SelectedPath = '${quotePowerShell(initialPath)}'` : '',
    '$result = $dialog.ShowDialog($owner)',
    '$owner.Close()',
    "if ($result -eq 'OK') { $dialog.SelectedPath }",
  ]
    .filter(Boolean)
    .join('\n');
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-STA', '-Command', script], {
    timeout: PICKER_TIMEOUT_MS,
    windowsHide: true,
  });

  return stdout.trim() || null;
}

async function pickOnMac(initialPath: string): Promise<string | null> {
  const location = initialPath ? ` default location POSIX file "${quoteAppleScript(initialPath)}"` : '';
  const script = `POSIX path of (choose folder${location})`;
  const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: PICKER_TIMEOUT_MS });

  return stdout.trim() || null;
}

async function pickOnLinux(initialPath: string): Promise<string | null> {
  const args = ['--file-selection', '--directory'];

  if (initialPath) {
    args.push(`--filename=${initialPath.endsWith('/') ? initialPath : `${initialPath}/`}`);
  }

  const { stdout } = await execFileAsync('zenity', args, { timeout: PICKER_TIMEOUT_MS });

  return stdout.trim() || null;
}

export async function pickNativeDirectory(initialPath = ''): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      return await pickOnWindows(initialPath);
    }

    if (process.platform === 'darwin') {
      return await pickOnMac(initialPath);
    }

    if (process.platform === 'linux') {
      return await pickOnLinux(initialPath);
    }
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PathPickerUnsupportedError();
    }

    return null;
  }

  throw new PathPickerUnsupportedError();
}
