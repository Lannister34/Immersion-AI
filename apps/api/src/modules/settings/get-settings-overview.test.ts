import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getSettingsOverview } from './application/get-settings-overview.js';

describe('getSettingsOverview', () => {
  let previousDataRoot: string | undefined;
  let temporaryDataRoot: string;

  beforeEach(async () => {
    previousDataRoot = process.env.IMMERSION_DATA_ROOT;
    temporaryDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-settings-overview-'));
    process.env.IMMERSION_DATA_ROOT = temporaryDataRoot;
  });

  afterEach(async () => {
    if (previousDataRoot) {
      process.env.IMMERSION_DATA_ROOT = previousDataRoot;
    } else {
      delete process.env.IMMERSION_DATA_ROOT;
    }
    await fs.rm(temporaryDataRoot, { recursive: true, force: true });
  });

  it('defaults to italic actions and unhighlighted quotes when the stored profile has no message formatting', async () => {
    await fs.writeFile(path.join(temporaryDataRoot, 'user-settings.json'), JSON.stringify({ userName: 'Tester' }));

    expect(getSettingsOverview().profile.messageFormatting).toEqual({ actionsItalic: true, quotesHighlighted: false });
  });
});
