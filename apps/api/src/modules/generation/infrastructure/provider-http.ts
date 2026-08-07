/** Верхняя граница одной генерации: длинные ответы легально идут минутами. */
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

export function buildRequestSignal(signal: AbortSignal | undefined) {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

export function isAbortError(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

/** Тело ошибки провайдера обрезаем: в лог и в интерфейс идёт суть, не дамп. */
export async function readProviderErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();

    return text ? `: ${text.slice(0, 500)}` : '';
  } catch {
    return '';
  }
}
