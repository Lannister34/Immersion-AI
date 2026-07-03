import { buildApiApp } from './app.js';
import { setupGracefulShutdown } from './lib/llm-process.js';

const app = buildApiApp();
setupGracefulShutdown();

async function startServer() {
  try {
    await app.listen({
      // Local-only by default: the API serves stored provider credentials and file
      // mutations. Opt in to LAN exposure explicitly via IMMERSION_API_HOST.
      host: process.env.IMMERSION_API_HOST ?? '127.0.0.1',
      port: Number.parseInt(process.env.IMMERSION_API_PORT ?? '4787', 10),
    });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void startServer();
