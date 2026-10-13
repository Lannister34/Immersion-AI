import type { PathLike, StatOptions } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { vi } from 'vitest';

export function failFileStatOf(fileName: string, code: string): void {
  const realStat = fs.stat;
  vi.spyOn(fs, 'stat').mockImplementation(((target: PathLike, options?: StatOptions) =>
    path.basename(String(target)) === fileName
      ? Promise.reject(Object.assign(new Error(`${code}: stat '${fileName}'`), { code }))
      : realStat(target, options)) as typeof fs.stat);
}
