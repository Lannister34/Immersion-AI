import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  buildPickerInvocation,
  PathPickerUnsupportedError,
  type PickerInvocation,
} from './directory-picker-invocation.js';
import { classifyPickerFailure, isCancelOutput, type PickerFailure } from './directory-picker-outcome.js';

const execFileAsync = promisify(execFile);

const PICKER_TIMEOUT_MS = 5 * 60 * 1000;

function readFailure(error: unknown): PickerFailure {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';

  return {
    code: typeof code === 'number' || typeof code === 'string' ? code : undefined,
    stderr,
  };
}

async function runPicker(invocation: PickerInvocation): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(invocation.command, invocation.args, {
      env: invocation.env,
      timeout: PICKER_TIMEOUT_MS,
      windowsHide: true,
    });

    return stdout;
  } catch (error) {
    const verdict = classifyPickerFailure(invocation.command, readFailure(error));

    if (verdict === 'unsupported') {
      throw new PathPickerUnsupportedError();
    }

    if (verdict === 'cancel') {
      return null;
    }

    throw error;
  }
}

export async function pickNativeDirectory(
  initialPath = '',
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const invocation = buildPickerInvocation(platform, initialPath);
  const output = await runPicker(invocation);

  if (output === null || isCancelOutput(invocation.command, output)) {
    return null;
  }

  const picked = output.trim();

  if (!picked) {
    throw new Error('Directory picker exited without printing a path.');
  }

  return picked;
}
