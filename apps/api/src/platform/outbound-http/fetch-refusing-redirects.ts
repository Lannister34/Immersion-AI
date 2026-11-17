import type { HttpFetch } from './http-fetch.js';

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

function resolveRedirectTarget(url: string, location: string | null): string | null {
  if (location === null) {
    return null;
  }

  try {
    return new URL(location, url).href;
  } catch {
    return null;
  }
}

export class RedirectRefusedError extends Error {
  readonly status: number;
  readonly target: string | null;

  constructor(status: number, target: string | null) {
    super(
      `Сервер ответил перенаправлением (HTTP ${status}${target === null ? '' : ` на ${target}`}). ` +
        'Запросы к провайдеру не следуют перенаправлениям, чтобы ключ не ушёл на другой сервер: укажите конечный адрес.',
    );
    this.name = 'RedirectRefusedError';
    this.status = status;
    this.target = target;
  }
}

export async function fetchRefusingRedirects(httpFetch: HttpFetch, url: string, init: RequestInit): Promise<Response> {
  const response = await httpFetch(url, { ...init, redirect: 'manual' });

  if (!REDIRECT_STATUSES.has(response.status)) {
    return response;
  }

  await response.body?.cancel();

  throw new RedirectRefusedError(response.status, resolveRedirectTarget(url, response.headers.get('location')));
}
