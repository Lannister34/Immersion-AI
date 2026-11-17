import { describe, expect, it } from 'vitest';

import { WebSessionStore } from './web-session-store.js';

function storeAt(clock: { now: number }, maxSessions = 4): WebSessionStore {
  return new WebSessionStore({ maxSessions, now: () => clock.now, ttlMs: 1000 });
}

describe('WebSessionStore', () => {
  it('creates random 256-bit tokens that are valid until they expire', () => {
    const clock = { now: 0 };
    const store = storeAt(clock);
    const first = store.create();
    const second = store.create();

    expect(first).toMatch(/^[\w-]{43}$/u);
    expect(second).not.toBe(first);
    expect(store.isValid(first)).toBe(true);

    clock.now += 1000;
    expect(store.isValid(first)).toBe(false);
  });

  it('admits one page load after login and ends the session at the next one', () => {
    const store = storeAt({ now: 0 });
    const token = store.create();

    expect(store.admitDocumentLoad(token)).toBe(true);
    expect(store.isValid(token)).toBe(true);
    expect(store.admitDocumentLoad(token)).toBe(false);
    expect(store.isValid(token)).toBe(false);
  });

  it('admits no page load for an unknown, missing or expired token', () => {
    const clock = { now: 0 };
    const store = storeAt(clock);
    const token = store.create();

    expect(store.admitDocumentLoad('forged')).toBe(false);
    expect(store.admitDocumentLoad(null)).toBe(false);

    clock.now += 1000;
    expect(store.admitDocumentLoad(token)).toBe(false);
  });

  it('knows no token after revoking it', () => {
    const store = storeAt({ now: 0 });
    const token = store.create();

    store.revoke(token);
    expect(store.isValid(token)).toBe(false);
  });

  it('keeps at most the configured number of sessions, ending the oldest', () => {
    const store = storeAt({ now: 0 }, 2);
    const oldest = store.create();
    const middle = store.create();
    const newest = store.create();

    expect([store.isValid(oldest), store.isValid(middle), store.isValid(newest)]).toEqual([false, true, true]);
  });
});
