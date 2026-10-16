import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      env: { TZ: 'Europe/Berlin' },
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'dev-server/**/*.test.ts', 'tests/**/*.test.ts'],
    },
  }),
);
