import { getRunningRuntimeEndpoint } from '../../runtime/application/get-running-runtime-endpoint.js';
import type { RuntimeEndpointPort } from '../application/runtime-endpoint-port.js';

/**
 * Composition-edge adapter: the single place where the providers module is
 * allowed to reach into the runtime module to satisfy RuntimeEndpointPort.
 */
export const runtimeEndpointAdapter: RuntimeEndpointPort = {
  getRunningEndpoint: () => getRunningRuntimeEndpoint(),
};
