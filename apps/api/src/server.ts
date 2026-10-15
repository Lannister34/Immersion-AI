import { buildApiApp } from './app.js';
import { type ApiConfig, ApiConfigError } from './config/api-config.js';
import { readApiConfig } from './config/read-api-config.js';
import { getLlmProcessManager, setupGracefulShutdown } from './modules/runtime/infrastructure/llm-process-manager.js';

let config: ApiConfig;

try {
  config = readApiConfig();
} catch (error) {
  if (!(error instanceof ApiConfigError)) {
    throw error;
  }

  console.error(error.message);
  process.exit(1);
}

const app = buildApiApp(config);
setupGracefulShutdown();
void getLlmProcessManager()
  .reconnectToDetachedRuntime()
  .catch((error: unknown) => {
    app.log.error({ err: error }, 'llm-process: reconnect error');
  });

async function startServer() {
  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void startServer();
