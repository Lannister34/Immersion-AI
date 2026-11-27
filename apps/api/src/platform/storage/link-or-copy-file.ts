import { constants } from 'node:fs';
import fs from 'node:fs/promises';

import { isErrnoCode } from '../errno-code.js';

export type LinkOrCopyOutcome = 'linked' | 'copied';

const HARD_LINK_UNAVAILABLE_CODES = ['EXDEV', 'EPERM', 'ENOTSUP', 'ENOSYS', 'EMLINK', 'EISDIR'] as const;

function isHardLinkUnavailable(error: unknown): boolean {
  return HARD_LINK_UNAVAILABLE_CODES.some((code) => isErrnoCode(error, code));
}

export async function linkOrCopyFile(sourcePath: string, targetPath: string): Promise<LinkOrCopyOutcome> {
  try {
    await fs.link(sourcePath, targetPath);
    return 'linked';
  } catch (error) {
    if (!isHardLinkUnavailable(error)) {
      throw error;
    }
  }

  await fs.copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL);
  return 'copied';
}
