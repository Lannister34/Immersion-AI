import type { ExecFileException } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import { PathPickerUnsupportedError, pickNativeDirectory } from './native-directory-picker.js';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

type ExecFileCallback = (error: ExecFileException | null, result?: { stderr: string; stdout: string }) => void;

function answerPickerWith(error: ExecFileException | null, stdout = '') {
  execFileMock.mockImplementation((...args: unknown[]) => {
    const callback = args.at(-1) as ExecFileCallback;

    callback(error, error ? undefined : { stderr: '', stdout });
  });
}

describe('pickNativeDirectory', () => {
  it('returns the directory the dialog printed', async () => {
    answerPickerWith(null, 'D:\\models\n');

    await expect(pickNativeDirectory()).resolves.toBe('D:\\models');
  });

  it('reads a non-zero exit of the dialog tool as a cancel, the way zenity and osascript report one', async () => {
    answerPickerWith(Object.assign(new Error('Command failed'), { code: 1 }));

    await expect(pickNativeDirectory()).resolves.toBeNull();
  });

  it('reports the picker as unsupported when the dialog tool is not installed', async () => {
    answerPickerWith(Object.assign(new Error('spawn zenity ENOENT'), { code: 'ENOENT' }));

    await expect(pickNativeDirectory()).rejects.toBeInstanceOf(PathPickerUnsupportedError);
  });
});
