import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface SandboxDataRoot {
  readonly path: string;
  claim(): void;
  fillIfUnset(): void;
  remove(): void;
}

export function createSandboxDataRoot(): SandboxDataRoot {
  const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), 'immersion-api-test-data-'));

  return {
    path: sandboxPath,
    claim() {
      process.env.IMMERSION_DATA_ROOT = sandboxPath;
    },
    fillIfUnset() {
      if (!process.env.IMMERSION_DATA_ROOT?.trim()) {
        process.env.IMMERSION_DATA_ROOT = sandboxPath;
      }
    },
    remove() {
      fs.rmSync(sandboxPath, { force: true, recursive: true });
    },
  };
}
