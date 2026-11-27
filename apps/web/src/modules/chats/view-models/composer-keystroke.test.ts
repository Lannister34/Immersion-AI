import { describe, expect, it } from 'vitest';

import { isSendKeystroke } from './composer-keystroke';

describe('isSendKeystroke', () => {
  it('sends on Enter from a keyboard and keeps Shift+Enter for a new line', () => {
    expect(isSendKeystroke({ key: 'Enter', shiftKey: false }, false)).toBe(true);
    expect(isSendKeystroke({ key: 'Enter', shiftKey: true }, false)).toBe(false);
    expect(isSendKeystroke({ key: 'a', shiftKey: false }, false)).toBe(false);
  });

  it('leaves Enter to the on-screen keyboard of a touch-only device, which has no Shift+Enter for a new line', () => {
    expect(isSendKeystroke({ key: 'Enter', shiftKey: false }, true)).toBe(false);
  });
});
