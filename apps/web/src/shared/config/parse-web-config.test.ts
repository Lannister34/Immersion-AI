import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseWebConfig, WebConfigError } from './parse-web-config';

const ORIGIN_RULE = 'VITE_API_BASE_URL: must be an http(s) origin without a path, such as http://127.0.0.1:4787';

function rejectionOf(value: string): WebConfigError {
  try {
    parseWebConfig({ VITE_API_BASE_URL: value });
  } catch (error) {
    if (error instanceof WebConfigError) {
      return error;
    }

    throw error;
  }

  throw new Error(`Expected parseWebConfig to reject ${JSON.stringify(value)}`);
}

describe('parseWebConfig', () => {
  it('returns no API origin when VITE_API_BASE_URL is unset or blank, so requests stay relative to the page', () => {
    expect(parseWebConfig({})).toEqual({ apiOrigin: null });

    for (const blank of ['', '   ', '\t\n']) {
      expect(parseWebConfig({ VITE_API_BASE_URL: blank })).toEqual({ apiOrigin: null });
    }
  });

  it('parses an absolute http(s) base URL into the origin a browser serializes', () => {
    expect(parseWebConfig({ VITE_API_BASE_URL: ' http://127.0.0.1:4799 ' }).apiOrigin).toBe('http://127.0.0.1:4799');
    expect(parseWebConfig({ VITE_API_BASE_URL: 'HTTP://LocalHost:4787/' }).apiOrigin).toBe('http://localhost:4787');
    expect(parseWebConfig({ VITE_API_BASE_URL: 'http://[::1]:4787' }).apiOrigin).toBe('http://[::1]:4787');
    expect(parseWebConfig({ VITE_API_BASE_URL: 'https://example.com:443' }).apiOrigin).toBe('https://example.com');
    expect(parseWebConfig({ VITE_API_BASE_URL: 'https://пример.example' }).apiOrigin).toBe(
      'https://xn--e1afmkfd.example',
    );
  });

  it('rejects a relative or malformed URL', () => {
    for (const value of ['/api', 'api/chats', '127.0.0.1:4787', 'http://', 'not a url']) {
      expect(rejectionOf(value).issues).toEqual([ORIGIN_RULE]);
    }
  });

  it('rejects a non-http protocol', () => {
    for (const value of ['ftp://127.0.0.1:4787', 'ws://127.0.0.1:4787', 'file:///C:/api', 'javascript:alert(1)']) {
      expect(rejectionOf(value).issues).toEqual([ORIGIN_RULE]);
    }
  });

  it('rejects a path, query or hash, which every root-relative request path would silently drop', () => {
    for (const value of [
      'http://127.0.0.1:4787/api',
      'http://127.0.0.1:4787/путь',
      'http://127.0.0.1:4787/?token=1',
      'http://127.0.0.1:4787/#chat',
    ]) {
      expect(rejectionOf(value).issues).toEqual([ORIGIN_RULE]);
    }
  });

  it('rejects credentials, which fetch refuses on every request, and keeps them out of the message', () => {
    const error = rejectionOf('http://admin:s3cret@127.0.0.1:4787');

    expect(error.issues).toEqual([ORIGIN_RULE]);
    expect(error.message).toBe(`Invalid web configuration:\n  ${ORIGIN_RULE}`);
    expect(error.message).not.toContain('s3cret');
    expect(error.name).toBe('WebConfigError');
  });
});

describe('parseWebConfig in a browser without URL.canParse, such as Chrome before 120 or Safari before 17', () => {
  beforeEach(() => {
    class UrlWithoutCanParse extends URL {}

    Object.defineProperty(UrlWithoutCanParse, 'canParse', { value: undefined });
    vi.stubGlobal('URL', UrlWithoutCanParse);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('still parses a valid origin and rejects an invalid one with WebConfigError', () => {
    expect(parseWebConfig({ VITE_API_BASE_URL: 'http://127.0.0.1:4799' }).apiOrigin).toBe('http://127.0.0.1:4799');
    expect(rejectionOf('not a url').issues).toEqual([ORIGIN_RULE]);
  });
});

describe('the URL and fetch behaviour the API origin rule relies on', () => {
  it('a root-relative request path replaces the path, query and hash of the URL it resolves against', () => {
    expect(new URL('/api/chats', 'http://127.0.0.1:4787/prefix/?token=1#chat').toString()).toBe(
      'http://127.0.0.1:4787/api/chats',
    );
  });

  it('fetch refuses to build a request for a URL that carries credentials', () => {
    expect(() => new Request('http://admin:s3cret@127.0.0.1:4787/api/chats')).toThrow(TypeError);
  });
});
