import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isErrnoCode } from './errno-code.js';

describe('isErrnoCode', () => {
  it('matches the code node:fs reports for a missing file, and only that code', async () => {
    const missing = path.join(os.tmpdir(), `immersion-missing-${process.pid}`, 'absent.json');
    const error: unknown = await fs.stat(missing).then(
      () => null,
      (rejection: unknown) => rejection,
    );

    expect(isErrnoCode(error, 'ENOENT')).toBe(true);
    expect(isErrnoCode(error, 'EPERM')).toBe(false);
  });

  it.each([
    new Error('ENOENT'),
    'ENOENT',
    null,
    undefined,
    { code: 2 },
  ])('does not match %j, which carries no errno code', (value) => {
    expect(isErrnoCode(value, 'ENOENT')).toBe(false);
  });
});
