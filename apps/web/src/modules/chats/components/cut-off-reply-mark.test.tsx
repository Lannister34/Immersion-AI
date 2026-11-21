import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test-support/render-with-providers';
import { CutOffReplyMark } from './cut-off-reply-mark';

describe('CutOffReplyMark', () => {
  it('says the reply was cut because the context or the reply limit ran out, and points to Continue', async () => {
    await renderWithProviders(<CutOffReplyMark />);
    const mark = screen.getByRole('note');

    expect(mark.textContent).toBe('Ответ оборван: закончился контекст или лимит ответа');
    expect(mark.getAttribute('title')).toContain('«Продолжить»');
  });
});
