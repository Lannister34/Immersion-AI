import type { LogPort } from '../../../../platform/logging/log-port.js';
import type { HttpFetch } from '../../../../platform/outbound-http/http-fetch.js';

export interface ProviderClientDependencies {
  readonly httpFetch: HttpFetch;
  readonly logger: LogPort;
}
