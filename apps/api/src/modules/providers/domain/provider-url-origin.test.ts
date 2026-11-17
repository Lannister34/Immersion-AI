import { describe, expect, it } from 'vitest';

import { isSameProviderOrigin } from './provider-url-origin.js';

describe('isSameProviderOrigin', () => {
  it.each([
    ['https://api.openai.com/v1', 'https://api.openai.com/v1/'],
    ['https://api.openai.com/v1', 'https://api.openai.com/other/path?x=1#part'],
    ['https://api.openai.com/v1', '  https://api.openai.com/v1  '],
    ['https://api.openai.com/v1', 'HTTPS://API.OpenAI.COM/v1'],
    ['http://127.0.0.1/v1', 'http://127.0.0.1:80/v1'],
    ['https://api.anthropic.com/v1', 'https://api.anthropic.com:443/v1'],
    ['http://[::1]:5001', 'http://[0:0:0:0:0:0:0:1]:5001/v1'],
    ['http://127.0.0.1:5001', 'http://0x7f.0.0.1:5001'],
    ['https://xn--e1afmkfd.xn--p1ai/v1', 'https://пример.рф/v1'],
    ['https://api.openai.com', 'https://user:secret@api.openai.com/v1'],
    ['https://api.openai.com', 'https://evil.example@api.openai.com/v1'],
  ])('treats %s and %s as one server', (left, right) => {
    expect(isSameProviderOrigin(left, right)).toBe(true);
    expect(isSameProviderOrigin(right, left)).toBe(true);
  });

  it.each([
    ['http://api.example.com', 'https://api.example.com'],
    ['http://api.example.com:443', 'https://api.example.com'],
    ['https://api.example.com:80', 'http://api.example.com'],
    ['http://127.0.0.1:5001', 'http://127.0.0.1:5002'],
    ['http://127.0.0.1:5001', 'http://localhost:5001'],
    ['http://[::1]:5001', 'http://127.0.0.1:5001'],
    ['https://api.openai.com', 'https://api.openai.com.evil.example'],
    ['https://api.openai.com', 'https://api.openai.com@evil.example/v1'],
    ['https://api.openai.com', 'https://api.openai.com.'],
    ['https://api.openai.com', 'https:\\\\evil.example\\v1'],
  ])('treats %s and %s as different servers', (left, right) => {
    expect(isSameProviderOrigin(left, right)).toBe(false);
    expect(isSameProviderOrigin(right, left)).toBe(false);
  });

  it.each([
    ['not a url', 'not a url'],
    ['', ''],
    ['127.0.0.1:5001', '127.0.0.1:5001'],
    ['ftp://files.example.com', 'ftp://files.example.com'],
    ['file:///C:/keys', 'file:///C:/keys'],
    ['http://', 'http://'],
  ])('never matches a url it cannot read as http(s): %s', (left, right) => {
    expect(isSameProviderOrigin(left, right)).toBe(false);
  });
});
