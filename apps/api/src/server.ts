import { buildApiApp } from './app.js';
import { getLlmProcessManager, setupGracefulShutdown } from './modules/runtime/infrastructure/llm-process-manager.js';

const app = buildApiApp();
setupGracefulShutdown();
void getLlmProcessManager()
  .reconnectToDetachedRuntime()
  .catch((error: unknown) => {
    app.log.error({ err: error }, 'llm-process: reconnect error');
  });

async function startServer() {
  try {
    await app.listen({
      host: process.env.IMMERSION_API_HOST ?? '127.0.0.1',
      port: Number.parseInt(process.env.IMMERSION_API_PORT ?? '4787', 10),
    });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void startServer();
