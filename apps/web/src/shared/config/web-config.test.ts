import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function importWebConfigBuiltWith(apiBaseUrl: string | undefined) {
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);

  return import('./web-config');
}

describe('webConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('takes the API origin from VITE_API_BASE_URL in the build environment', async () => {
    const { webConfig } = await importWebConfigBuiltWith(' http://127.0.0.1:4799/ ');

    expect(webConfig).toEqual({ apiOrigin: 'http://127.0.0.1:4799' });
  });

  it('has no API origin when the build environment leaves VITE_API_BASE_URL unset', async () => {
    const { webConfig } = await importWebConfigBuiltWith(undefined);

    expect(webConfig).toEqual({ apiOrigin: null });
  });

  it('fails the app at load, before any request, when VITE_API_BASE_URL is invalid', async () => {
    await expect(importWebConfigBuiltWith('http://127.0.0.1:4799/api')).rejects.toMatchObject({
      name: 'WebConfigError',
      issues: ['VITE_API_BASE_URL: must be an http(s) origin without a path, such as http://127.0.0.1:4787'],
    });
  });
});
