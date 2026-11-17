import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import type { FastifyPluginAsync } from 'fastify';

import type { LogPort } from '../../platform/logging/log-port.js';
import type { HttpFetch } from '../../platform/outbound-http/http-fetch.js';
import type { UserSettingsDocument } from '../settings/index.js';
import { getRunningRuntimeEndpoint, type RunningRuntimeEndpoint } from './application/get-running-runtime-endpoint.js';
import { getRuntimeOverview } from './application/get-runtime-overview.js';
import type { ModelScanner } from './application/model-scanner.js';
import { reconnectDetachedRuntime } from './application/reconnect-detached-runtime.js';
import { RuntimeConfigRepository } from './application/runtime-config-repository.js';
import type { RuntimeProcess } from './application/runtime-process.js';
import { createRuntimeRoutes, type RuntimeRoutesDependencies } from './interface/http/routes.js';

export interface RuntimeModuleDependencies {
  readonly dataRoot: string;
  readonly httpFetch: HttpFetch;
  readonly logger: LogPort;
  readonly modelScanner: ModelScanner;
  readonly projectRoot: string;
  readonly runtimeProcess: RuntimeProcess;
  readonly settingsDocument: UserSettingsDocument;
}

export interface RuntimeModule {
  readonly routes: FastifyPluginAsync;
  getRunningRuntimeEndpoint(): Promise<RunningRuntimeEndpoint | null>;
  getRuntimeOverview(): Promise<RuntimeOverviewResponse>;
  reconnect(): Promise<void>;
  close(): void;
}

export function createRuntimeModule({ settingsDocument, ...rest }: RuntimeModuleDependencies): RuntimeModule {
  const dependencies: RuntimeRoutesDependencies = {
    ...rest,
    runtimeConfig: new RuntimeConfigRepository({ document: settingsDocument, runtimeProcess: rest.runtimeProcess }),
  };

  return {
    routes: createRuntimeRoutes(dependencies),
    getRunningRuntimeEndpoint: () => getRunningRuntimeEndpoint(dependencies),
    getRuntimeOverview: () => getRuntimeOverview(dependencies),
    reconnect: () => reconnectDetachedRuntime(dependencies),
    close: () => dependencies.runtimeProcess.dispose(),
  };
}
