import { describe, expect, it } from 'vitest';

import { mergeDevServerEnvironment } from './merge-dev-server-environment.js';

describe('mergeDevServerEnvironment', () => {
  it('lets a process value win over the local env file', () => {
    expect(mergeDevServerEnvironment({ IMMERSION_WEB_LAN: '1' }, { IMMERSION_WEB_LAN: '0' })).toEqual({
      IMMERSION_WEB_LAN: '0',
    });
  });

  it('lets a blank process value unset what the file sets, as a test or a launcher needs', () => {
    expect(mergeDevServerEnvironment({ IMMERSION_WEB_PASSWORD: '4821' }, { IMMERSION_WEB_PASSWORD: '' })).toEqual({
      IMMERSION_WEB_PASSWORD: '',
    });
  });

  it('keeps the file value when the process has none', () => {
    expect(mergeDevServerEnvironment({ IMMERSION_WEB_LAN: '1' }, { OTHER: undefined })).toMatchObject({
      IMMERSION_WEB_LAN: '1',
    });
  });
});
