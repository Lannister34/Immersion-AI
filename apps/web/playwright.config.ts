import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from '@playwright/test';

const configDirectory = fileURLToPath(new URL('.', import.meta.url));
const smokeFixtureDirectory = fileURLToPath(new URL('../api/testdata/smoke-data', import.meta.url));

// Config is evaluated in the runner process AND again in every worker process.
// The data root must be created exactly once (in the runner) and inherited by
// workers via the environment, otherwise test hooks reset a different copy of
// the fixture than the one the API server actually serves.
let smokeDataDirectory = process.env.IMMERSION_SMOKE_DATA_ROOT;
if (!smokeDataDirectory) {
  smokeDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'immersion-web-smoke-'));
  fs.cpSync(smokeFixtureDirectory, smokeDataDirectory, { recursive: true });
  process.env.IMMERSION_SMOKE_DATA_ROOT = smokeDataDirectory;
}

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'corepack pnpm --filter @immersion/api dev',
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: {
        IMMERSION_API_PORT: '4797',
        IMMERSION_DATA_ROOT: smokeDataDirectory,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:4797/health',
    },
    {
      command: 'corepack pnpm dev:smoke',
      cwd: configDirectory,
      env: {
        IMMERSION_API_PROXY_TARGET: 'http://127.0.0.1:4797',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:4173',
    },
  ],
});
