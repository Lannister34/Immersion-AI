import { buildApiApp } from './app.js';
import { createApiDependencies } from './composition/api-dependencies.js';
import { createApiModules } from './composition/create-api-modules.js';
import { type ApiConfig, ApiConfigError } from './config/api-config.js';
import { readApiConfig } from './config/read-api-config.js';
import { registerShutdownSignals } from './lifecycle/register-shutdown-signals.js';
import { startApiServer } from './lifecycle/start-api-server.js';

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
const modules = createApiModules(dependencies);
const app = buildApiApp(dependencies, modules);

registerShutdownSignals(app, { signals: process, exit: process.exit, deadlineMs: 5_000 });

startApiServer(app, config).then(
  () => modules.runtime.reconnect(),
  () => {
    process.exitCode = 1;
  },
);
