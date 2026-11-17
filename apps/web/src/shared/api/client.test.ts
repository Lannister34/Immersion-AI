import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { stubFetch } from '../../test-support/stub-fetch';

const reloadIntoLogin = vi.hoisted(() => vi.fn());

vi.mock('./reload-into-login', () => ({ reloadIntoLogin }));

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

describe('a request whose web session has ended', () => {
  beforeEach(() => {
    vi.resetModules();
    reloadIntoLogin.mockClear();
  });

  function answer(status: number, body: unknown): void {
    stubFetch().mockResolvedValue(Response.json(body, { status }));
  }

  it('reloads the page into the login screen, as a page load always asks for the password', async () => {
    const { apiGet } = await import('./client');
    answer(401, { code: 'web_login_required', message: 'Сеанс закончился: обновите страницу и введите пароль.' });

    await expect(apiGet('/api/chats', z.unknown())).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(reloadIntoLogin).toHaveBeenCalledTimes(1);
  });

  it('reloads on a delete that answers without a body too', async () => {
    const { apiDeleteNoContent } = await import('./client');
    answer(401, { code: 'web_login_required', message: 'Сеанс закончился: обновите страницу и введите пароль.' });

    await expect(apiDeleteNoContent('/api/chats/x')).rejects.toMatchObject({ statusCode: 401 });
    expect(reloadIntoLogin).toHaveBeenCalledTimes(1);
  });

  it('leaves other errors, a plain 401 among them, to the caller', async () => {
    const { apiGet } = await import('./client');
    answer(401, { code: 'unauthorized', message: 'Нет доступа.' });

    await expect(apiGet('/api/chats', z.unknown())).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(reloadIntoLogin).not.toHaveBeenCalled();
  });
});
