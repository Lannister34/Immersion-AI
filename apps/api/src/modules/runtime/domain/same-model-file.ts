import path from 'node:path';

function foldWindowsFileNameCase(filePath: string): string {
  return filePath
    .split('')
    .map((codeUnit) => {
      const upperCase = codeUnit.toUpperCase();

      return upperCase.length === 1 && upperCase.toLowerCase() === codeUnit ? upperCase : codeUnit;
    })
    .join('');
}

export function isSameModelFile(left: string, right: string, platform: NodeJS.Platform): boolean {
  if (platform === 'win32') {
    return foldWindowsFileNameCase(path.win32.resolve(left)) === foldWindowsFileNameCase(path.win32.resolve(right));
  }

  return path.posix.resolve(left) === path.posix.resolve(right);
}
