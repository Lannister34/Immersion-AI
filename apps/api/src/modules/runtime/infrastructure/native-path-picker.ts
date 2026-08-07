import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PICKER_TIMEOUT_MS = 5 * 60 * 1000;

export type PathPickerKind = 'directory' | 'file';

export class PathPickerUnsupportedError extends Error {
  constructor() {
    super('Native path picker is not available on this platform.');
    this.name = 'PathPickerUnsupportedError';
  }
}

function quotePowerShell(value: string): string {
  return value.replace(/'/gu, "''");
}

function quoteAppleScript(value: string): string {
  return value.replace(/(["\\])/gu, '\\$1');
}

async function pickOnWindows(kind: PathPickerKind, initialPath: string): Promise<string | null> {
  const dialog =
    kind === 'directory'
      ? [
          '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
          initialPath ? `$dialog.SelectedPath = '${quotePowerShell(initialPath)}'` : '',
          "if ($dialog.ShowDialog() -eq 'OK') { $dialog.SelectedPath }",
        ]
      : [
          '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
          "$dialog.Filter = 'Модели GGUF (*.gguf)|*.gguf|Все файлы (*.*)|*.*'",
          initialPath ? `$dialog.InitialDirectory = '${quotePowerShell(initialPath)}'` : '',
          "if ($dialog.ShowDialog() -eq 'OK') { $dialog.FileName }",
        ];
  const script = ['Add-Type -AssemblyName System.Windows.Forms', ...dialog.filter(Boolean)].join('; ');
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-STA', '-Command', script], {
    timeout: PICKER_TIMEOUT_MS,
    windowsHide: true,
  });

  return stdout.trim() || null;
}

async function pickOnMac(kind: PathPickerKind, initialPath: string): Promise<string | null> {
  const target = kind === 'directory' ? 'folder' : 'file';
  const location = initialPath ? ` default location POSIX file "${quoteAppleScript(initialPath)}"` : '';
  const script = `POSIX path of (choose ${target}${location})`;
  const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: PICKER_TIMEOUT_MS });

  return stdout.trim() || null;
}

async function pickOnLinux(kind: PathPickerKind, initialPath: string): Promise<string | null> {
  const args = ['--file-selection', ...(kind === 'directory' ? ['--directory'] : [])];

  if (initialPath) {
    args.push(`--filename=${initialPath.endsWith('/') ? initialPath : `${initialPath}/`}`);
  }

  const { stdout } = await execFileAsync('zenity', args, { timeout: PICKER_TIMEOUT_MS });

  return stdout.trim() || null;
}

/**
 * Системный диалог выбора пути. Приложение локальное и открывается на той же
 * машине, где идёт браузер, поэтому диалог операционной системы — самый
 * короткий путь к длинному пути с моделями. Где диалога нет, честно говорим об
 * этом: ручной ввод остаётся рабочим вариантом.
 *
 * Отмену пользователем отличаем от ошибки: обе ветки возвращают null, потому
 * что и zenity, и osascript выходят с ненулевым кодом при отмене.
 */
export async function pickNativePath(kind: PathPickerKind, initialPath = ''): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      return await pickOnWindows(kind, initialPath);
    }

    if (process.platform === 'darwin') {
      return await pickOnMac(kind, initialPath);
    }

    if (process.platform === 'linux') {
      return await pickOnLinux(kind, initialPath);
    }
  } catch (error) {
    // Диалог отменили или инструмента нет — второе отличаем по коду запуска.
    if (typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PathPickerUnsupportedError();
    }

    return null;
  }

  throw new PathPickerUnsupportedError();
}
