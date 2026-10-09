import { getRunningRuntimeEndpoint } from '../../runtime/application/get-running-runtime-endpoint.js';
import type { RuntimeEndpointPort } from '../application/runtime-endpoint-port.js';

export const runtimeEndpointAdapter: RuntimeEndpointPort = {
  getRunningEndpoint: () => getRunningRuntimeEndpoint(),
};
