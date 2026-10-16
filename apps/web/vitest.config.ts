import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      env: { TZ: 'Europe/Berlin' },
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            include: ['src/**/*.test.ts', 'dev-server/**/*.test.ts', 'tests/**/*.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            environment: 'jsdom',
            include: ['src/**/*.test.tsx'],
            setupFiles: ['src/test-support/dom-setup.ts'],
          },
        },
      ],
    },
  }),
);
