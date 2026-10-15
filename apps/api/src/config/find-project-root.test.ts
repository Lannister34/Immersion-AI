import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findProjectRoot, ProjectRootNotFoundError } from './find-project-root.js';

describe('findProjectRoot', () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'immersion-project-root-'));
  });

  afterEach(() => {
    fs.rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  function createDirectory(...segments: string[]): string {
    const directory = path.join(temporaryDirectory, ...segments);

    fs.mkdirSync(directory, { recursive: true });

    return directory;
  }

  function markWorkspace(directory: string) {
    fs.writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
  }

  it('walks up to the directory that holds pnpm-workspace.yaml, through non-ASCII and spaced names', () => {
    const projectRoot = createDirectory('Иммерсия AI ✦');
    const startDirectory = createDirectory('Иммерсия AI ✦', 'apps', 'api', 'src', 'config');

    markWorkspace(projectRoot);

    expect(findProjectRoot(startDirectory)).toBe(projectRoot);
    expect(findProjectRoot(projectRoot)).toBe(projectRoot);
  });

  it('stops at the nearest workspace, so a worktree inside the repository finds its own root', () => {
    const repositoryRoot = createDirectory('repository');
    const worktreeRoot = createDirectory('repository', '.claude', 'worktrees', 'slice');
    const startDirectory = createDirectory('repository', '.claude', 'worktrees', 'slice', 'apps', 'api', 'src');

    markWorkspace(repositoryRoot);
    markWorkspace(worktreeRoot);

    expect(findProjectRoot(startDirectory)).toBe(worktreeRoot);
  });

  it('throws when no ancestor holds pnpm-workspace.yaml', () => {
    const startDirectory = createDirectory('no-workspace', 'apps', 'api');

    expect(() => findProjectRoot(startDirectory)).toThrow(ProjectRootNotFoundError);
  });
});
