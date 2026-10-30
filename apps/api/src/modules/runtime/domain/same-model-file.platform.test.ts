import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isSameModelFile } from './same-model-file.js';

const WRITTEN_FILE_NAME = 'Модель-straße.gguf';

type Respell = (writtenPath: string) => string;

let writtenPath = '';

function inWrittenFolder(fileName: string): Respell {
  return (written) => path.join(path.dirname(written), fileName);
}

function withDriveLetterInOtherCase(written: string): string {
  const driveLetter = written.charAt(0);
  const otherCase = driveLetter === driveLetter.toUpperCase() ? driveLetter.toLowerCase() : driveLetter.toUpperCase();

  return `${otherCase}${written.slice(1)}`;
}

function withForwardSlashes(written: string): string {
  return written.split(path.win32.sep).join('/');
}

function expectPredicateToAgreeWithFileSystem(spelling: string, namesWrittenFile: boolean) {
  expect({
    fileSystem: fs.existsSync(spelling),
    predicate: isSameModelFile(writtenPath, spelling, process.platform),
  }).toEqual({ fileSystem: namesWrittenFile, predicate: namesWrittenFile });
}

beforeAll(() => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'immersion-same-model-file-'));
  writtenPath = path.join(folder, WRITTEN_FILE_NAME);
  fs.writeFileSync(writtenPath, 'gguf');
});

afterAll(() => {
  if (writtenPath) {
    fs.rmSync(path.dirname(writtenPath), { force: true, recursive: true });
  }
});

describe.runIf(process.platform === 'win32')('isSameModelFile against the Windows file system', () => {
  it.each<[string, Respell, boolean]>([
    ['the spelling it was written by', (written) => written, true],
    ['Cyrillic letters in upper case', inWrittenFolder('МОДЕЛЬ-straße.gguf'), true],
    ['Latin letters in upper case and ß kept', inWrittenFolder('Модель-STRAßE.GGUF'), true],
    ['ß written as SS', inWrittenFolder('Модель-STRASSE.gguf'), false],
    ['ß written as ss', inWrittenFolder('Модель-strasse.gguf'), false],
    ['ſ for s, a letter of its own that upper-cases to S', inWrittenFolder('Модель-ſtraße.gguf'), false],
    ['the drive letter in the other case', withDriveLetterInOtherCase, true],
    ['forward slashes', withForwardSlashes, true],
  ])('names a non-ASCII model file as Windows opens it, ignoring case one UTF-16 unit at a time, for a path with %s', (_spelling, respell, namesWrittenFile) => {
    expectPredicateToAgreeWithFileSystem(respell(writtenPath), namesWrittenFile);
  });
});

describe.runIf(process.platform === 'linux')('isSameModelFile against the Linux file system', () => {
  it.each<[string, Respell, boolean]>([
    ['the spelling it was written by', (written) => written, true],
    ['Cyrillic letters in upper case', inWrittenFolder('МОДЕЛЬ-straße.gguf'), false],
    ['Latin letters in upper case and ß kept', inWrittenFolder('Модель-STRAßE.GGUF'), false],
    ['ß written as SS', inWrittenFolder('Модель-STRASSE.gguf'), false],
    ['ſ for s', inWrittenFolder('Модель-ſtraße.gguf'), false],
  ])('names a non-ASCII model file as Linux opens it, with letter case significant, for a path with %s', (_spelling, respell, namesWrittenFile) => {
    expectPredicateToAgreeWithFileSystem(respell(writtenPath), namesWrittenFile);
  });
});

describe.runIf(process.platform === 'darwin')('isSameModelFile against the macOS file system', () => {
  it.todo(
    'is not pinned: a default APFS volume ignores letter case while the predicate keeps it there, the documented gap',
  );
});
