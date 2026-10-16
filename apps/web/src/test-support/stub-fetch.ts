import { type Mock, onTestFinished, vi } from 'vitest';

export function stubFetch(): Mock<typeof fetch> {
  const stub = vi.fn<typeof fetch>();

  vi.stubGlobal('fetch', stub);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });

  return stub;
}
