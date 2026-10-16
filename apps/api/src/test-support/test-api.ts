import { onTestFinished } from 'vitest';

import { buildApiApp } from '../app.js';
import { type ApiDependencies, createApiDependencies } from '../composition/api-dependencies.js';
import { type ApiModules, createApiModules } from '../composition/create-api-modules.js';
import { type ApiEnvironment, parseApiConfig } from '../config/api-config.js';
import { type CapturingLogger, createCapturingLogger } from './capturing-logger.js';
import { claimTemporaryProject } from './claim-temporary-project.js';
import { stubGlobalFetch } from './global-fetch-stub.js';
import type { HttpStub } from './http-stub.js';
import { createManualClock, type ManualClock, type ManualClockOptions } from './manual-clock.js';
import type { ProjectFixture } from './temporary-project.js';
import { createUserSettingsFixtureFile, type UserSettingsFixtureFile } from './user-settings-fixture.js';

export interface TestApiOptions {
  readonly fixture?: ProjectFixture;
  readonly environment?: ApiEnvironment;
  readonly clock?: ManualClockOptions;
}

export interface TestApi {
  readonly app: ReturnType<typeof buildApiApp>;
  readonly dependencies: ApiDependencies;
  readonly modules: ApiModules;
  readonly projectRoot: string;
  readonly dataRoot: string;
  readonly http: HttpStub;
  readonly clock: ManualClock;
  readonly logs: CapturingLogger;
  readonly settings: UserSettingsFixtureFile;
}

export async function createTestApi(options: TestApiOptions = {}): Promise<TestApi> {
  if (options.environment?.IMMERSION_DATA_ROOT !== undefined) {
    throw new Error('createTestApi owns IMMERSION_DATA_ROOT: every test gets its own temporary data root.');
  }

  const project = await claimTemporaryProject(options.fixture ?? 'empty');

  const config = parseApiConfig(
    { IMMERSION_LOG_LEVEL: 'silent', ...options.environment, IMMERSION_DATA_ROOT: project.dataRoot },
    project.projectRoot,
  );
  const http = stubGlobalFetch();
  const clock = createManualClock(options.clock);
  const logs = createCapturingLogger();
  const dependencies = createApiDependencies(config, { clock, httpFetch: http.fetch, logger: logs.logger });
  const modules = createApiModules(dependencies);
  const app = buildApiApp(dependencies, modules);
  onTestFinished(() => app.close());

  return {
    app,
    dependencies,
    modules,
    projectRoot: project.projectRoot,
    dataRoot: project.dataRoot,
    http,
    clock,
    logs,
    settings: createUserSettingsFixtureFile(project.dataRoot),
  };
}
