export class RuntimeModelNotFoundError extends Error {
  constructor(readonly modelPath: string) {
    super(`Model not found: ${modelPath}`);
    this.name = 'RuntimeModelNotFoundError';
  }
}

export class RuntimeProjectorNotFoundError extends Error {
  constructor(readonly projectorPath: string) {
    super(`Multimodal projector not found: ${projectorPath}`);
    this.name = 'RuntimeProjectorNotFoundError';
  }
}

export class RuntimeBinaryMissingError extends Error {
  constructor() {
    super('llama-server не найден. Проверьте bin/ в основном рабочем дереве.');
    this.name = 'RuntimeBinaryMissingError';
  }
}

export class RuntimeInstallError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RuntimeInstallError';
  }
}
