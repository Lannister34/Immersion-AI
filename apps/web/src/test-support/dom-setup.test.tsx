import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { stubFetch } from './stub-fetch';
import { UnarrangedFetchError } from './unarranged-fetch-guard';

async function loadDomFetchGuard() {
  const { domFetchGuard } = await import('./dom-fetch-guard');

  return domFetchGuard;
}

describe('the dom setup', () => {
  it('has the fetch guard in place before a test file imports anything of it', async () => {
    await expect(fetch('/api/characters')).rejects.toEqual(new UnarrangedFetchError('/api/characters'));

    const domFetchGuard = await loadDomFetchGuard();
    expect(() => domFetchGuard.assertNoneRefused()).toThrow(/fetched \/api\/characters without a stub/);
  });

  it('fails a test after it fetched without a stub, even when the code swallowed the rejection', async () => {
    const domFetchGuard = await loadDomFetchGuard();
    const assertNoneRefused = domFetchGuard.assertNoneRefused;
    const verdicts: string[] = [];
    const spy = vi.spyOn(domFetchGuard, 'assertNoneRefused').mockImplementation(() => {
      try {
        assertNoneRefused();
        verdicts.push('none refused');
      } catch (error) {
        verdicts.push(error instanceof Error ? error.message : String(error));
      }
    });
    onTestFinished(() => {
      spy.mockRestore();
      expect(verdicts).toEqual([expect.stringContaining('fetched /api/chats without a stub')]);
    });

    await fetch('/api/chats').catch(() => undefined);
  });

  it('lets a fetch a test stubbed through test support answer', async () => {
    const stub = stubFetch().mockResolvedValue(new Response('{"ok":true}'));

    const response = await fetch('/api/settings');

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(stub).toHaveBeenCalledWith('/api/settings');
  });
});
