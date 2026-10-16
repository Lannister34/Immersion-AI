export class UnarrangedFetchError extends Error {
  constructor(readonly url: string) {
    super(`Refused a test fetch of ${url}: the test arranged no stub for it.`);
    this.name = 'UnarrangedFetchError';
  }
}

export interface UnarrangedFetchGuard {
  assertNoneRefused(): void;
  uninstall(): void;
}

function describeRequest(input: RequestInfo | URL) {
  return input instanceof Request ? input.url : String(input);
}

export function installUnarrangedFetchGuard(): UnarrangedFetchGuard {
  const originalFetch = globalThis.fetch;
  const refused: string[] = [];

  const refuseUnarrangedFetch: typeof fetch = (input) => {
    const url = describeRequest(input);
    refused.push(url);

    return Promise.reject(new UnarrangedFetchError(url));
  };

  globalThis.fetch = refuseUnarrangedFetch;

  return {
    assertNoneRefused() {
      const urls = new Set(refused.splice(0));

      if (urls.size > 0) {
        throw new Error(
          `This test, or work an earlier test left running, fetched ${[...urls].join(', ')} without a stub. ` +
            'Stub fetch through test support before the code under test calls it.',
        );
      }
    },
    uninstall() {
      globalThis.fetch = originalFetch;
    },
  };
}
