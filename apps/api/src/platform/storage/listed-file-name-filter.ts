import { isPlainFileName } from '@immersion/contracts/common';

import type { LogPort } from '../logging/log-port.js';

export interface ListedFileNameFilterOptions {
  readonly directory: string;
  readonly logger: LogPort;
}

export type ListedFileNameFilter = (fileName: string, id?: string) => boolean;

export function createListedFileNameFilter({ directory, logger }: ListedFileNameFilterOptions): ListedFileNameFilter {
  const warnedFileNames = new Set<string>();

  return (fileName, id = fileName) => {
    if (fileName.startsWith('.')) return false;
    if (isPlainFileName(id)) return true;

    if (!warnedFileNames.has(fileName)) {
      warnedFileNames.add(fileName);
      logger.warn({ directory, fileName, id }, 'Library: skipped a file name that is not a plain file name');
    }
    return false;
  };
}
