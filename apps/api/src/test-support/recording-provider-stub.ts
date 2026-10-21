import { onTestFinished, vi } from 'vitest';

export interface RecordedProviderRequest {
  body: unknown;
  url: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status });
}

function recordProviderRequests(reply: () => Response): RecordedProviderRequest[] {
  const requests: RecordedProviderRequest[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      requests.push({
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        url: input instanceof Request ? input.url : input.toString(),
      });

      return reply();
    }),
  );
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });

  return requests;
}

export function stubProviderReply(content: string, finishReason = 'stop'): RecordedProviderRequest[] {
  return recordProviderRequests(() =>
    jsonResponse({ choices: [{ finish_reason: finishReason, message: { content } }] }, 200),
  );
}

export function stubProviderFailure(status: number): RecordedProviderRequest[] {
  return recordProviderRequests(() => jsonResponse({ error: 'provider failed' }, status));
}
