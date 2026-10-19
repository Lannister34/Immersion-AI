import { buildApiApp } from './app.js';
import { createApiDependencies } from './composition/api-dependencies.js';
import { createApiModules } from './composition/create-api-modules.js';
import { type ApiConfig, ApiConfigError } from './config/api-config.js';
import { readApiConfig } from './config/read-api-config.js';
import { registerShutdownSignals } from './lifecycle/register-shutdown-signals.js';
import { startApiServer } from './lifecycle/start-api-server.js';
import { reconnectDetachedRuntime } from './modules/runtime/index.js';

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

const dependencies = createApiDependencies(config);
const app = buildApiApp(dependencies, createApiModules(dependencies));

registerShutdownSignals(app, { signals: process, exit: process.exit, deadlineMs: 5_000 });

startApiServer(app, config).then(
  () => reconnectDetachedRuntime(app.log),
  () => {
    process.exitCode = 1;
  },
);
