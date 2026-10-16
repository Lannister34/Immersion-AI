import { describe, expect, it, onTestFinished } from 'vitest';

import { stubFetch } from './stub-fetch';
import { installUnarrangedFetchGuard, UnarrangedFetchError } from './unarranged-fetch-guard';

function installGuardForTest() {
  const guard = installUnarrangedFetchGuard();
  onTestFinished(() => {
    guard.uninstall();
  });

  return guard;
}

describe('installUnarrangedFetchGuard', () => {
  it('refuses a fetch the test did not stub and fails the next assertion with its url', async () => {
    const guard = installGuardForTest();

    await expect(fetch('http://api.invalid/api/characters')).rejects.toEqual(
      new UnarrangedFetchError('http://api.invalid/api/characters'),
    );
    await expect(fetch(new Request('http://api.invalid/api/chats'))).rejects.toBeInstanceOf(UnarrangedFetchError);

    expect(() => guard.assertNoneRefused()).toThrow(
      /fetched http:\/\/api\.invalid\/api\/characters, http:\/\/api\.invalid\/api\/chats without a stub/,
    );
    expect(() => guard.assertNoneRefused()).not.toThrow();
  });

  it('lets a stubbed fetch answer and is back in place once the stub is removed with its test', async () => {
    const guard = installGuardForTest();
    onTestFinished(async () => {
      await expect(fetch('/api/settings')).rejects.toEqual(new UnarrangedFetchError('/api/settings'));
      expect(() => guard.assertNoneRefused()).toThrow(/fetched \/api\/settings without a stub/);
    });
    const stub = stubFetch().mockResolvedValue(new Response('{}'));

    await fetch(new URL('http://api.invalid/api/settings'));

    expect(stub).toHaveBeenCalledTimes(1);
    expect(() => guard.assertNoneRefused()).not.toThrow();
  });

  it('restores the original fetch when uninstalled', () => {
    const originalFetch = globalThis.fetch;
    const guard = installGuardForTest();

    expect(globalThis.fetch).not.toBe(originalFetch);

    guard.uninstall();

    expect(globalThis.fetch).toBe(originalFetch);
  });
});
