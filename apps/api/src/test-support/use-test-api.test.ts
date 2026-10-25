import { describe, expect, it } from 'vitest';

import { useTestApi } from './use-test-api.js';

describe('useTestApi', () => {
  const api = useTestApi({ fixture: 'smoke' });

  it('builds the api before the test, from the options it was given', async () => {
    const response = await api().app.inject({ method: 'GET', url: '/api/settings/overview' });

    expect(response.statusCode).toBe(200);
    expect((await api().settings.read()).userName).toBe('Тестер');
  });
});
