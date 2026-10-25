import type { ZodType } from 'zod';

export interface RecordedHttpRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly bodyText: string;
  readonly signal: AbortSignal | null;
  json<T>(schema: ZodType<T>): T;
}

async function readBodyText(body: RequestInit['body']): Promise<string> {
  if (body === undefined || body === null) {
    return '';
  }

  return typeof body === 'string' ? body : new Response(body).text();
}

export async function recordHttpRequest(url: string, init: RequestInit | undefined): Promise<RecordedHttpRequest> {
  const bodyText = await readBodyText(init?.body);

  return {
    url,
    method: (init?.method ?? 'GET').toUpperCase(),
    headers: new Headers(init?.headers),
    bodyText,
    signal: init?.signal ?? null,
    json: (schema) => schema.parse(JSON.parse(bodyText)),
  };
}
