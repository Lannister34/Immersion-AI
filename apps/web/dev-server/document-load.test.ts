import { describe, expect, it } from 'vitest';

import { isDocumentLoad } from './document-load.js';

const NAVIGATION_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

describe('isDocumentLoad', () => {
  it('reads Fetch Metadata where the browser sends it (localhost and HTTPS)', () => {
    expect(isDocumentLoad('GET', { 'sec-fetch-dest': 'document' })).toBe(true);
    expect(isDocumentLoad('GET', { 'sec-fetch-dest': 'iframe' })).toBe(true);
    expect(isDocumentLoad('GET', { accept: NAVIGATION_ACCEPT, 'sec-fetch-dest': 'image' })).toBe(false);
    expect(isDocumentLoad('GET', { 'sec-fetch-dest': 'script' })).toBe(false);
  });

  it('falls back to the Accept header, which is what a plain-HTTP LAN page sends', () => {
    expect(isDocumentLoad('GET', { accept: NAVIGATION_ACCEPT })).toBe(true);
    expect(isDocumentLoad('HEAD', { accept: NAVIGATION_ACCEPT })).toBe(true);
  });

  it('does not count sub-resources or writes without Fetch Metadata as page loads', () => {
    expect(isDocumentLoad('GET', { accept: 'application/json' })).toBe(false);
    expect(isDocumentLoad('GET', { accept: 'image/avif,image/webp,*/*' })).toBe(false);
    expect(isDocumentLoad('GET', { accept: 'text/event-stream' })).toBe(false);
    expect(isDocumentLoad('GET', { accept: '*/*' })).toBe(false);
    expect(isDocumentLoad('POST', { accept: NAVIGATION_ACCEPT })).toBe(false);
  });
});
