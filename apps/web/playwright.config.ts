import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from '@playwright/test';

import { ensureSmokeDataRoot } from './tests/smoke-data-root.js';
import {
  PASSWORD_GATED_WEB_ORIGIN,
  PASSWORD_GATED_WEB_PORT,
  SMOKE_WEB_PASSWORD,
  STUB_PROVIDER_PORT,
  STUB_PROVIDER_URL,
} from './tests/smoke-servers.js';

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
        IMMERSION_WEB_LAN: '0',
        IMMERSION_WEB_PASSWORD: '',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://127.0.0.1:4173',
    },
    {
      command: `corepack pnpm exec vite --config tests/vite.smoke-login.config.ts --host 127.0.0.1 --port ${PASSWORD_GATED_WEB_PORT}`,
      cwd: configDirectory,
      env: {
        IMMERSION_API_PROXY_TARGET: 'http://127.0.0.1:4797',
        IMMERSION_WEB_LAN: '0',
        IMMERSION_WEB_PASSWORD: SMOKE_WEB_PASSWORD,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: PASSWORD_GATED_WEB_ORIGIN,
    },
    {
      command: `node tests/stub-chat-provider.ts ${STUB_PROVIDER_PORT}`,
      cwd: configDirectory,
      reuseExistingServer: false,
      timeout: 30_000,
      url: `${STUB_PROVIDER_URL}/models`,
    },
  ],
});
