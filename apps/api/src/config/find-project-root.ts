import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

export class ProjectRootNotFoundError extends Error {
  constructor(startDirectory: string) {
    super(`No ${WORKSPACE_MARKER} in ${startDirectory} or any directory above it`);
    this.name = 'ProjectRootNotFoundError';
  }
}

export function findProjectRoot(startDirectory: string): string {
  let directory = path.resolve(startDirectory);

  while (!fs.existsSync(path.join(directory, WORKSPACE_MARKER))) {
    const parent = path.dirname(directory);

    if (parent === directory) {
      throw new ProjectRootNotFoundError(startDirectory);
    }

    directory = parent;
  }

  return directory;
}
