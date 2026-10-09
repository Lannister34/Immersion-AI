export interface RunningRuntimeEndpointInfo {
  baseUrl: string;
  model: string | null;
  visionProjectorPath: string | null;
}

export interface RuntimeEndpointPort {
  getRunningEndpoint(): Promise<RunningRuntimeEndpointInfo | null>;
}
