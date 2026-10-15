import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function importClientBuiltWith(apiBaseUrl: string | undefined) {
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);

  return import('./client');
}

describe('createApiUrl', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('puts the configured API origin in front of a request path', async () => {
    const { createApiUrl } = await importClientBuiltWith('http://127.0.0.1:4799');

    expect(createApiUrl('/api/chats/%D1%87%D0%B0%D1%82/export')).toBe(
      'http://127.0.0.1:4799/api/chats/%D1%87%D0%B0%D1%82/export',
    );
  });

  it('leaves a request path relative to the page when no API origin is configured', async () => {
    const { createApiUrl } = await importClientBuiltWith(undefined);

    expect(createApiUrl('/api/chats')).toBe('/api/chats');
  });
});
