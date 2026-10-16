import { describe, expect, it } from 'vitest';

import { isEditTargetIntact } from './message-edit-target';

const MESSAGES = [{ content: 'Привет! 👋' }, { content: '*кивает* «Здравствуй»' }, { content: '' }];

describe('isEditTargetIntact', () => {
  it('keeps an edit target whose position still holds its content', () => {
    expect(isEditTargetIntact(MESSAGES, { baseContent: '*кивает* «Здравствуй»', messageIndex: 2 })).toBe(true);
    expect(isEditTargetIntact(MESSAGES, { baseContent: '', messageIndex: 3 })).toBe(true);
  });

  it('reports an edit target as broken when its position now holds other content', () => {
    const afterEarlierDelete = MESSAGES.slice(1);

    expect(isEditTargetIntact(afterEarlierDelete, { baseContent: '*кивает* «Здравствуй»', messageIndex: 2 })).toBe(
      false,
    );
    expect(isEditTargetIntact(MESSAGES, { baseContent: 'Привет! 👋 ', messageIndex: 1 })).toBe(false);
  });

  it('reports an edit target as broken when its position is gone', () => {
    expect(isEditTargetIntact(MESSAGES, { baseContent: '', messageIndex: 4 })).toBe(false);
    expect(isEditTargetIntact([], { baseContent: '', messageIndex: 1 })).toBe(false);
    expect(isEditTargetIntact(MESSAGES, { baseContent: 'Привет! 👋', messageIndex: 0 })).toBe(false);
  });
});
