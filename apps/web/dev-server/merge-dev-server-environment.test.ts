import { describe, expect, it } from 'vitest';

import { mergeDevServerEnvironment } from './merge-dev-server-environment.js';

describe('mergeDevServerEnvironment', () => {
  it('lets a non-blank process value win over the local env file', () => {
    expect(mergeDevServerEnvironment({ IMMERSION_WEB_LAN: '1' }, { IMMERSION_WEB_LAN: '0' })).toEqual({
      IMMERSION_WEB_LAN: '0',
    });
  });

  it('keeps the file value when the process value is blank or missing', () => {
    expect(
      mergeDevServerEnvironment({ IMMERSION_WEB_LAN: '1' }, { IMMERSION_WEB_LAN: ' ', OTHER: undefined }),
    ).toMatchObject({ IMMERSION_WEB_LAN: '1' });
  });
});
