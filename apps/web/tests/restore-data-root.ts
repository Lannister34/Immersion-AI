import fs from 'node:fs/promises';
import path from 'node:path';

export async function restoreDataRoot(root: string, fixture: string) {
  for (const entry of await fs.readdir(root)) {
    await fs.rm(path.join(root, entry), { force: true, maxRetries: 3, recursive: true });
  }

  await fs.cp(fixture, root, { recursive: true });
}
