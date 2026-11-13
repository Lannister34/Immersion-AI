import { describe, expect, it } from 'vitest';

import { formatContextEstimate } from './context-estimate';

function plain(text: string): string {
  return text.replace(/\s/g, ' ');
}

describe('formatContextEstimate', () => {
  it('marks an approximate count with ≈ and groups the digits the Russian way', () => {
    expect(
      plain(formatContextEstimate({ contextWindow: 32_768, tokenCountMethod: 'approximate', totalTokens: 1_250 })),
    ).toBe('≈ 1 250 / 32 768');
  });

  it('shows an exact count without ≈', () => {
    expect(plain(formatContextEstimate({ contextWindow: 8_192, tokenCountMethod: 'exact', totalTokens: 640 }))).toBe(
      '640 / 8 192',
    );
  });
});
