import { describe, expect, it } from 'vitest';

import { createDeferred } from './deferred.js';
import { createInMemoryUserSettings } from './in-memory-user-settings.js';

describe('createInMemoryUserSettings', () => {
  it('keeps what an update returns and hands out copies a caller cannot change it through', async () => {
    const settings = createInMemoryUserSettings({ profile: { userName: 'Тестер' } });

    settings.read().profile = 'изменено снаружи';
    await settings.update((current) => ({ ...current, backendMode: 'builtin' }));

    expect(settings.read()).toEqual({ backendMode: 'builtin', profile: { userName: 'Тестер' } });
    expect(settings.writes).toEqual([{ backendMode: 'builtin', profile: { userName: 'Тестер' } }]);
  });

  it('runs overlapping updates one after another, so neither loses the change of the other', async () => {
    const settings = createInMemoryUserSettings();
    const firstHeld = createDeferred();

    const first = settings.update(async (current) => {
      await firstHeld.promise;
      return { ...current, first: true };
    });
    const second = settings.update((current) => ({ ...current, second: true }));
    firstHeld.resolve();
    await Promise.all([first, second]);

    expect(settings.read()).toEqual({ first: true, second: true });
  });
});
