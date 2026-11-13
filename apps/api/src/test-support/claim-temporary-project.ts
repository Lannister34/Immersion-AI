import { onTestFinished } from 'vitest';

import { createTemporaryProject, type ProjectFixture, type TemporaryProject } from './temporary-project.js';

export async function claimTemporaryProject(fixture: ProjectFixture): Promise<TemporaryProject> {
  const project = await createTemporaryProject(fixture);
  onTestFinished(() => project.remove());

  return project;
}
