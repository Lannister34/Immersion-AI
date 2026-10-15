import fs from 'node:fs';
import path from 'node:path';

export function directorySnapshot(directory: string): Record<string, string> {
  const snapshot: Record<string, string> = {};

  for (const entry of fs.readdirSync(directory, { recursive: true, withFileTypes: true })) {
    const absolute = path.join(entry.parentPath, entry.name);
    const relative = path.relative(directory, absolute).replaceAll(path.sep, '/');
    snapshot[relative] = entry.isDirectory() ? '<directory>' : fs.readFileSync(absolute, 'utf8');
  }

  return snapshot;
}
