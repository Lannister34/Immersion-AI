import { fileURLToPath, URL } from 'node:url';
import { mergeConfig } from 'vite';

import viteConfig from '../vite.config.js';

export default mergeConfig(viteConfig, {
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-smoke-login', import.meta.url)),
});
