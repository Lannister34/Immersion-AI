import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const apiProxyTarget = process.env.IMMERSION_API_PROXY_TARGET ?? 'http://127.0.0.1:4787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@immersion/contracts': fileURLToPath(new URL('../../packages/contracts/src', import.meta.url)),
      '@immersion/test-utils': fileURLToPath(new URL('../../packages/test-utils/src', import.meta.url)),
    },
  },
  server: {
    port: 4788,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
