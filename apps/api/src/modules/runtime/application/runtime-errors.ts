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

export class RuntimeNotRunningError extends Error {
  constructor() {
    super('Модель не запущена: применять контекст некуда. Запустите модель на странице сервера.');
    this.name = 'RuntimeNotRunningError';
  }
}

export class RuntimeLaunchUnknownError extends Error {
  constructor() {
    super(
      'Параметры запуска работающей модели неизвестны: она запущена до того, как их стали записывать. Перезапустите её на странице сервера, затем примените контекст.',
    );
    this.name = 'RuntimeLaunchUnknownError';
  }
}

export class GenerationInProgressError extends Error {
  constructor() {
    super('Идёт генерация ответа: дождитесь её окончания или остановите её, затем примените контекст.');
    this.name = 'GenerationInProgressError';
  }
}

export interface RuntimeContextApplyFailure {
  readonly previousContextSize: number;
  readonly reason: string;
  readonly requestedContextSize: number;
  readonly rollbackFailure: string | null;
}

function describeContextApplyFailure(failure: RuntimeContextApplyFailure): string {
  const head = `Модель не запустилась с контекстом ${failure.requestedContextSize}: ${failure.reason}.`;

  if (failure.rollbackFailure !== null) {
    return `${head} Запустить её с прежним контекстом ${failure.previousContextSize} тоже не удалось: ${failure.rollbackFailure}.`;
  }

  return `${head} Она снова работает с прежним контекстом ${failure.previousContextSize}.`;
}

export class RuntimeContextApplyFailedError extends Error {
  constructor(readonly failure: RuntimeContextApplyFailure) {
    super(describeContextApplyFailure(failure));
    this.name = 'RuntimeContextApplyFailedError';
  }
}
