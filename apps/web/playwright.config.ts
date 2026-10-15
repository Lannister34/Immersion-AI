import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from '@playwright/test';

import { ensureSmokeDataRoot } from './tests/smoke-data-root.js';

const configDirectory = fileURLToPath(new URL('.', import.meta.url));
const smokeDataDirectory = ensureSmokeDataRoot();

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  globalTeardown: './tests/global-teardown.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'corepack pnpm --filter @immersion/api dev',
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: {
        IMMERSION_API_PORT: '4797',
        IMMERSION_WEB_PORT: '4173',
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
