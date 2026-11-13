import {
  PickRuntimeDirectoryCommandSchema,
  PickRuntimeDirectoryResponseSchema,
  RuntimeConfigCommandSchema,
  RuntimeInstallCommandSchema,
  RuntimeStartCommandSchema,
} from '@immersion/contracts/runtime';
import type { FastifyPluginAsync } from 'fastify';

import { parseRequest } from '../../../../platform/http/parse-request.js';
import { getRuntimeLogs } from '../../application/get-runtime-logs.js';
import { getRuntimeOverview } from '../../application/get-runtime-overview.js';
import { type InstallRuntimeDependencies, installRuntime } from '../../application/install-runtime.js';
import type { ModelScanner } from '../../application/model-scanner.js';
import type { RuntimeConfigRepository } from '../../application/runtime-config-repository.js';
import type { RuntimeProcess } from '../../application/runtime-process.js';
import { startRuntime } from '../../application/start-runtime.js';
import { stopRuntime } from '../../application/stop-runtime.js';
import { updateRuntimeConfig } from '../../application/update-runtime-config.js';
import { pickNativeDirectory } from '../../infrastructure/native-directory-picker.js';

export interface RuntimeRoutesDependencies extends InstallRuntimeDependencies {
  readonly modelScanner: ModelScanner;
  readonly runtimeConfig: RuntimeConfigRepository;
  readonly runtimeProcess: RuntimeProcess;
}

export function createRuntimeRoutes(dependencies: RuntimeRoutesDependencies): FastifyPluginAsync {
  return async (app) => {
    app.get('/overview', async () => getRuntimeOverview(dependencies));

    app.get('/logs', async () => getRuntimeLogs(dependencies));

    app.put('/config', async (request) =>
      updateRuntimeConfig(parseRequest(RuntimeConfigCommandSchema, request.body), dependencies),
    );

    app.post('/start', async (request) =>
      startRuntime(parseRequest(RuntimeStartCommandSchema, request.body), dependencies),
    );

    app.post('/pick-directory', async (request) => {
      const command = parseRequest(PickRuntimeDirectoryCommandSchema, request.body);
      const path = await pickNativeDirectory(command.initialPath ?? '');

      return PickRuntimeDirectoryResponseSchema.parse({ path });
    });

    app.post('/stop', async () => stopRuntime(dependencies));

    app.post('/install', async (request) =>
      installRuntime(parseRequest(RuntimeInstallCommandSchema, request.body), dependencies),
    );
  };
}
