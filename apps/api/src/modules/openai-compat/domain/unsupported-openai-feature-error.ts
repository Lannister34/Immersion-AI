export class UnsupportedOpenAiFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedOpenAiFeatureError';
  }
}
