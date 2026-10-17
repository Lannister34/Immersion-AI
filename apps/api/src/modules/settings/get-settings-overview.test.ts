import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { useTemporaryDataRoot } from '../../test-support/use-temporary-data-root.js';
import { getSettingsOverview } from './application/get-settings-overview.js';

describe('getSettingsOverview', () => {
  const dataRoot = useTemporaryDataRoot();

  it('defaults to italic actions and unhighlighted quotes when the stored profile has no message formatting', async () => {
    await fs.writeFile(path.join(dataRoot(), 'user-settings.json'), JSON.stringify({ userName: 'Tester' }));

    const { profile } = getSettingsOverview();

    expect(profile.userName).toBe('Tester');
    expect(profile.messageFormatting).toEqual({ actionsItalic: true, quotesHighlighted: false });
  });
});
