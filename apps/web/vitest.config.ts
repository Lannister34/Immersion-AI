import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@immersion/contracts': fileURLToPath(new URL('../../packages/contracts/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    exclude: ['tests/**'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
