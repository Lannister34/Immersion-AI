import type { FastifyPluginAsync } from 'fastify';

export interface RootRouteOptions {
  readonly webPort: number;
}

function resolveWebRedirectUrl(requestHost: string | undefined, webPort: number) {
  const fallbackUrl = `http://127.0.0.1:${webPort}/chat`;

  if (!requestHost) {
    return fallbackUrl;
  }

  try {
    const url = new URL(`http://${requestHost}`);

    url.port = String(webPort);
    url.pathname = '/chat';
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return fallbackUrl;
  }
}

export const rootRoute: FastifyPluginAsync<RootRouteOptions> = async (app, { webPort }) => {
  app.get('/', async (request, reply) => {
    return reply.redirect(resolveWebRedirectUrl(request.headers.host, webPort));
  });
};
