export interface RunningRuntimeEndpointInfo {
  baseUrl: string;
  model: string | null;
}

/**
 * Providers' view of the built-in runtime: only "is something running, and
 * where". The runtime module implements this port at composition time so its
 * internals never leak into provider logic.
 */
export interface RuntimeEndpointPort {
  getRunningEndpoint(): Promise<RunningRuntimeEndpointInfo | null>;
}
