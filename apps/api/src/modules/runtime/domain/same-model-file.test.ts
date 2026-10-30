import { describe, expect, it } from 'vitest';

import { isSameModelFile } from './same-model-file.js';

const SCANNED_ON_WINDOWS = 'D:\\Модели\\Qwen\\qwen-14b.Q4_K_M.gguf';
const SCANNED_ON_POSIX = '/srv/Модели/Qwen/qwen-14b.Q4_K_M.gguf';

describe('isSameModelFile on Windows', () => {
  it.each([
    ['forward slashes, as a script types the path', 'D:/Модели/Qwen/qwen-14b.Q4_K_M.gguf'],
    ['a lower-case drive letter', 'd:\\Модели\\Qwen\\qwen-14b.Q4_K_M.gguf'],
    ['".." and "." segments', 'D:\\Модели\\Mistral\\..\\.\\Qwen\\qwen-14b.Q4_K_M.gguf'],
    ['doubled and mixed separators', 'D:\\\\Модели//Qwen\\qwen-14b.Q4_K_M.gguf'],
    [
      'other letter case in Cyrillic and Latin names, since NTFS ignores case',
      'D:\\МОДЕЛИ\\qwen\\QWEN-14B.q4_k_m.GGUF',
    ],
  ])('names the scanned file with %s', (_variant, startPath) => {
    expect(isSameModelFile(startPath, SCANNED_ON_WINDOWS, 'win32')).toBe(true);
    expect(isSameModelFile(SCANNED_ON_WINDOWS, startPath, 'win32')).toBe(true);
  });

  it('tells apart files that share a name in different folders', () => {
    expect(isSameModelFile('D:\\Модели\\qwen-14b.Q4_K_M.gguf', SCANNED_ON_WINDOWS, 'win32')).toBe(false);
  });

  it('folds case one character at a time as NTFS does, so ß never equals SS', () => {
    expect(isSameModelFile('D:\\Модели\\straße.gguf', 'D:\\Модели\\STRASSE.gguf', 'win32')).toBe(false);
    expect(isSameModelFile('D:\\Модели\\straße.gguf', 'D:\\МОДЕЛИ\\STRAßE.gguf', 'win32')).toBe(true);
  });

  it('folds a letter only to an upper case that folds back to it, as NTFS does, so ſ never equals S nor ı I', () => {
    expect(isSameModelFile('D:\\Модели\\ſtraße.gguf', 'D:\\Модели\\STRAßE.gguf', 'win32')).toBe(false);
    expect(isSameModelFile('D:\\Модели\\qwen-ı.gguf', 'D:\\Модели\\QWEN-I.gguf', 'win32')).toBe(false);
    expect(isSameModelFile('D:\\Модели\\qwen-i.gguf', 'D:\\Модели\\QWEN-I.gguf', 'win32')).toBe(true);
  });
});

describe('isSameModelFile on POSIX', () => {
  it.each([
    ['".." and "." segments', '/srv/Модели/Mistral/.././Qwen/qwen-14b.Q4_K_M.gguf'],
    ['doubled separators', '/srv//Модели/Qwen//qwen-14b.Q4_K_M.gguf'],
  ])('names the scanned file with %s', (_variant, startPath) => {
    expect(isSameModelFile(startPath, SCANNED_ON_POSIX, 'linux')).toBe(true);
  });

  it('keeps letter case significant off Windows, as Linux file systems do', () => {
    expect(isSameModelFile('/srv/МОДЕЛИ/Qwen/qwen-14b.Q4_K_M.gguf', SCANNED_ON_POSIX, 'linux')).toBe(false);
    expect(isSameModelFile('/srv/Модели/Qwen/QWEN-14B.Q4_K_M.gguf', SCANNED_ON_POSIX, 'linux')).toBe(false);
  });

  it('reads a back slash as part of a file name, not as a separator', () => {
    expect(isSameModelFile('/srv/Модели/Qwen\\qwen-14b.Q4_K_M.gguf', SCANNED_ON_POSIX, 'linux')).toBe(false);
  });
});
