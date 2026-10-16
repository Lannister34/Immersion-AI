import type { Plugin } from 'vite';

const EDITOR_LAUNCH_PATH = '/__open-in-editor';
const FORBIDDEN = 403;

export function refuseCrossSiteEditorLaunch(): Plugin {
  return {
    name: 'immersion:refuse-cross-site-editor-launch',
    configureServer(server) {
      server.middlewares.use(EDITOR_LAUNCH_PATH, (request, response, next) => {
        if (request.headers['sec-fetch-site'] === 'same-origin') {
          next();
          return;
        }

        response.statusCode = FORBIDDEN;
        response.end();
      });
    },
  };
}
