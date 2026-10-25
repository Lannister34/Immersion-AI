import type { HttpFetch } from '../../../../platform/outbound-http/http-fetch.js';

export interface ProviderClientDependencies {
  readonly httpFetch: HttpFetch;
}
