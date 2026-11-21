export interface LaunchContextSource {
  contextSizeForModel(modelName: string): number;
}

export interface GenerationActivity {
  hasActiveGeneration(): boolean;
}
