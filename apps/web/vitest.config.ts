import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Каталоги, а не index.ts: иначе сабпаты вида @immersion/contracts/chats
    // склеиваются в путь внутри файла и не резолвятся (как в vite.config.ts).
    alias: {
      '@immersion/contracts': fileURLToPath(new URL('../../packages/contracts/src', import.meta.url)),
      '@immersion/test-utils': fileURLToPath(new URL('../../packages/test-utils/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    exclude: ['tests/**'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
