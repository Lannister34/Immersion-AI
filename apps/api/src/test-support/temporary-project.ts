import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

export type ProjectFixture = 'empty' | 'smoke';

export interface TemporaryProject {
  readonly projectRoot: string;
  readonly dataRoot: string;
  remove(): Promise<void>;
}

const SMOKE_DATA_DIRECTORY = fileURLToPath(new URL('../../testdata/smoke-data', import.meta.url));

async function fillDataRoot(dataRoot: string, fixture: ProjectFixture): Promise<void> {
  if (fixture === 'smoke') {
    await fs.cp(SMOKE_DATA_DIRECTORY, dataRoot, { recursive: true });
    return;
  }

  await fs.mkdir(dataRoot, { recursive: true });
}

export async function createTemporaryProject(fixture: ProjectFixture): Promise<TemporaryProject> {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-api-test-'));
  const remove = () => fs.rm(temporaryRoot, { force: true, maxRetries: 3, recursive: true });
  const projectRoot = path.join(temporaryRoot, 'project');
  const dataRoot = path.join(projectRoot, 'data');

  try {
    await fillDataRoot(dataRoot, fixture);
  } catch (error) {
    await remove();
    throw error;
  }

  return { projectRoot, dataRoot, remove };
}
