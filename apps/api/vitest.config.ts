import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@immersion/contracts': fileURLToPath(new URL('../../packages/contracts/src', import.meta.url)),
      '@immersion/domain': fileURLToPath(new URL('../../packages/domain/src', import.meta.url)),
    },
  },
  test: {
    env: { IMMERSION_DATA_ROOT: 'data-root-inherited-from-the-shell' },
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-support/vitest-setup.ts'],
  },
});
