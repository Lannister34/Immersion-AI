export interface RunningRuntimeEndpointInfo {
  baseUrl: string;
  contextSize: number | null;
  model: string | null;
  visionProjectorPath: string | null;
}

export interface RuntimeEndpointPort {
  getRunningEndpoint(): Promise<RunningRuntimeEndpointInfo | null>;
}
