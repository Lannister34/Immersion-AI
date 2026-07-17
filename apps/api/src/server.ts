import { buildApiApp } from './app.js';
import { getLlmProcessManager, setupGracefulShutdown } from './modules/runtime/infrastructure/llm-process-manager.js';

const app = buildApiApp();
setupGracefulShutdown();
// Explicit startup step: re-attach to a llama-server left running by a previous
// API process. This used to be a hidden import-time side effect.
void getLlmProcessManager()
  .reconnectToDetachedRuntime()
  .catch((error: unknown) => {
    app.log.error({ err: error }, 'llm-process: reconnect error');
  });

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
