export const runtimeModuleId = 'runtime' as const;

export {
  getRunningRuntimeEndpoint,
  type RunningRuntimeEndpoint,
} from './application/get-running-runtime-endpoint.js';
export { reconnectDetachedRuntime } from './application/reconnect-detached-runtime.js';
export { runtimeRoutes } from './interface/http/routes.js';
