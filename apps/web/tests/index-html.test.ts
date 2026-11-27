import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function attributeOf(tag: string, name: string): string | null {
  return new RegExp(`\\s${name}="([^"]*)"`, 'u').exec(tag)?.[1] ?? null;
}

function externalStylesheetTags(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*>/gu)]
    .map((match) => match[0])
    .filter((tag) => attributeOf(tag, 'rel') === 'stylesheet' && /^https?:\/\//u.test(attributeOf(tag, 'href') ?? ''));
}

describe('index.html', () => {
  it('finds the external font stylesheet it guards', () => {
    expect(externalStylesheetTags(indexHtml)).toHaveLength(1);
  });

  it('never lets a stalled external stylesheet hold back the app, which left the page blank after login', () => {
    for (const tag of externalStylesheetTags(indexHtml)) {
      expect(attributeOf(tag, 'media')).toBe('print');
      expect(attributeOf(tag, 'onload')).toBe("this.media='all'");
    }
  });
});
