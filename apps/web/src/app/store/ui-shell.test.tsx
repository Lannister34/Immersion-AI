import { describe, expect, it, vi } from 'vitest';

import { NARROW_VIEWPORT_QUERY } from '../../shared/lib/media-queries';
import { mediaQueryStub } from '../../test-support/media-query-stub';

async function createShellStoreOn(viewport: 'phone' | 'desktop') {
  mediaQueryStub.matchOnly(viewport === 'phone' ? [NARROW_VIEWPORT_QUERY] : []);
  vi.resetModules();
  const { useUiShellStore } = await import('./ui-shell');
  return useUiShellStore;
}

describe('ui shell store', () => {
  it('docks the chat panel open on a desktop viewport', async () => {
    const store = await createShellStoreOn('desktop');

    expect(store.getState().chatRightPanelOpen).toBe(true);
  });

  it('starts the chat panel closed on a phone, where it is a sheet that would cover the chat', async () => {
    const store = await createShellStoreOn('phone');

    expect(store.getState().chatRightPanelOpen).toBe(false);
  });
});
