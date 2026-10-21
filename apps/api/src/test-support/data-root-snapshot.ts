import fs from 'node:fs/promises';
import path from 'node:path';

export async function snapshotDataRoot(root: string): Promise<Record<string, string>> {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
  const snapshot: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(entry.parentPath, entry.name);
    snapshot[path.relative(root, filePath)] = await fs.readFile(filePath, 'utf8');
  }
  return snapshot;
}
