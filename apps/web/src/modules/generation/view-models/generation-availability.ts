import type { GenerationReadinessResponse } from '@immersion/contracts/generation';

interface GenerationAvailabilityInput {
  isError: boolean;
  isLoading: boolean;
  readiness: GenerationReadinessResponse | undefined;
}

export interface GenerationAvailabilityViewModel {
  blockReason: string | undefined;
  isBlocked: boolean;
}

export function toGenerationAvailabilityViewModel({
  isError,
  isLoading,
  readiness,
}: GenerationAvailabilityInput): GenerationAvailabilityViewModel {
  if (isLoading && !readiness) {
    return {
      blockReason: 'Проверяем готовность модели...',
      isBlocked: true,
    };
  }

  if (isError) {
    return {
      blockReason: 'Не удалось проверить готовность модели. Проверьте API.',
      isBlocked: true,
    };
  }

  if (readiness?.status === 'blocked') {
    return {
      blockReason: readiness.issue?.message ?? 'Модель не готова. Запустите модель на странице API.',
      isBlocked: true,
    };
  }

  return {
    blockReason: undefined,
    isBlocked: false,
  };
}
