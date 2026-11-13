import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { readDevServerConfig } from './dev-server/read-dev-server-config.js';
import { refuseCrossSiteEditorLaunch } from './dev-server/refuse-cross-site-editor-launch.js';
import { refuseForeignNetworkCallers } from './dev-server/refuse-foreign-network-callers.js';

const devServerConfig = readDevServerConfig();
const webRoot = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const contractsSource = join(workspaceRoot, 'packages', 'contracts', 'src');

export default defineConfig({
  plugins: [react(), tailwindcss(), refuseForeignNetworkCallers(), refuseCrossSiteEditorLaunch()],
  resolve: {
    alias: {
      '@immersion/contracts': contractsSource,
    },
  },
  server: {
    host: devServerConfig.host,
    port: 4788,
    strictPort: true,
    cors: false,
    fs: {
      allow: [webRoot, contractsSource, join(workspaceRoot, 'node_modules')],
    },
    proxy: {
      '/api': {
        target: devServerConfig.apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
