import { onTestFinished, vi } from 'vitest';

import { createTemporaryProject, type ProjectFixture, type TemporaryProject } from './temporary-project.js';

export async function claimTemporaryProject(fixture: ProjectFixture): Promise<TemporaryProject> {
  const project = await createTemporaryProject(fixture);
  onTestFinished(() => project.remove());
  // TODO: delete once every repository receives the data root from the composition root (F-43)
  vi.stubEnv('IMMERSION_DATA_ROOT', project.dataRoot);

  return project;
}
