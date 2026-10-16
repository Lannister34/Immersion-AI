import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { refuseCrossSiteEditorLaunch } from './dev-server/refuse-cross-site-editor-launch.js';

const apiProxyTarget = process.env.IMMERSION_API_PROXY_TARGET ?? 'http://127.0.0.1:4787';
const webRoot = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const contractsSource = join(workspaceRoot, 'packages', 'contracts', 'src');

export default defineConfig({
  plugins: [react(), tailwindcss(), refuseCrossSiteEditorLaunch()],
  resolve: {
    alias: {
      '@immersion/contracts': contractsSource,
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4788,
    strictPort: true,
    cors: false,
    fs: {
      allow: [webRoot, contractsSource, join(workspaceRoot, 'node_modules')],
    },
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
