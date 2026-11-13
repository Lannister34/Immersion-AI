import { describe, expect, it } from 'vitest';

import { createInMemoryUserSettings } from '../../test-support/in-memory-user-settings.js';
import { getSettingsOverview } from './application/get-settings-overview.js';

describe('getSettingsOverview', () => {
  it('defaults to italic actions and unhighlighted quotes when the stored profile has no message formatting', () => {
    const { profile } = getSettingsOverview({ userSettings: createInMemoryUserSettings({ userName: 'Tester' }) });

    expect(profile.userName).toBe('Tester');
    expect(profile.messageFormatting).toEqual({ actionsItalic: true, quotesHighlighted: false });
  });
});
