import type { ProviderModelsFetchDependencies } from './fetch-provider-models.js';
import type { RuntimeEndpointPort } from './runtime-endpoint-port.js';

export interface TestProviderConnectionDependencies extends ProviderModelsFetchDependencies {
  runtimeEndpointPort?: RuntimeEndpointPort;
}
