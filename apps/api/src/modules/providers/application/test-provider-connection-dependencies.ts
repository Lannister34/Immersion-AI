import type { ProviderModelsFetchDependencies } from './fetch-provider-models.js';
import type { GetProviderSettingsDependencies } from './get-provider-settings.js';
import type { RuntimeEndpointPort } from './runtime-endpoint-port.js';

export interface TestProviderConnectionDependencies
  extends ProviderModelsFetchDependencies,
    GetProviderSettingsDependencies {
  readonly runtimeEndpoint: RuntimeEndpointPort;
}
