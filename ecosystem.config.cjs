const path = require('path');

const node = process.execPath;
const projectRoot = __dirname;

module.exports = {
  apps: [
    {
      name: 'immersion-api',
      cwd: path.resolve(projectRoot, 'apps/api'),
      script: path.resolve(projectRoot, 'apps/api/node_modules/tsx/dist/cli.mjs'),
      args: 'watch src/server.ts',
      interpreter: node,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'development',
        IMMERSION_API_PORT: 4787,
        IMMERSION_WEB_PORT: 4788,
        // Данные лежат рядом с проектом; переопределяется через окружение.
        IMMERSION_DATA_ROOT: process.env.IMMERSION_DATA_ROOT || path.resolve(projectRoot, 'data'),
      },
    },
    {
      name: 'immersion-web',
      cwd: path.resolve(projectRoot, 'apps/web'),
      script: path.resolve(projectRoot, 'apps/web/node_modules/vite/bin/vite.js'),
      args: '--host 0.0.0.0 --port 4788',
      interpreter: node,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
