import type { ReplyTokenLimit } from '@immersion/contracts/common';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test-support/render-with-providers';
import { ReplyLimitField } from './reply-limit-field';

interface HarnessProps {
  contextLength: number;
  initial: ReplyTokenLimit;
  onChange: (value: ReplyTokenLimit) => void;
}

function Harness({ contextLength, initial, onChange }: HarnessProps) {
  const [value, setValue] = useState<ReplyTokenLimit>(initial);

  return (
    <ReplyLimitField
      contextLength={contextLength}
      id="limit"
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      restoredLimit={typeof initial === 'number' ? initial : 1024}
      value={value}
    />
  );
}

function limitInput(): HTMLInputElement {
  return screen.getByLabelText('max_length') as HTMLInputElement;
}

function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/\u00a0/gu, ' ');
}

describe('ReplyLimitField', () => {
  it('takes any whole number, such as 32256, which a step of 32 used to refuse', async () => {
    const onChange = vi.fn();
    await renderWithProviders(<Harness contextLength={48_000} initial={2048} onChange={onChange} />);

    for (const value of [32_256, 32_225, 1, 777]) {
      fireEvent.change(limitInput(), { target: { value: String(value) } });

      expect(limitInput().validity.stepMismatch).toBe(false);
      expect(onChange).toHaveBeenLastCalledWith(value);
    }
  });

  it("switches to no limit and back to the preset's saved number", async () => {
    const onChange = vi.fn();
    await renderWithProviders(<Harness contextLength={32_256} initial={3000} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Без лимита' }));

    expect(onChange).toHaveBeenLastCalledWith('unlimited');
    expect(limitInput().disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Без лимита' }));

    expect(onChange).toHaveBeenLastCalledWith(3000);
    expect(limitInput().value).toBe('3000');
  });

  it('shows how many tokens stay for the history, zero when the limit takes the whole context', async () => {
    await renderWithProviders(<Harness contextLength={32_256} initial={2048} onChange={vi.fn()} />);

    expect(plain(document.body.textContent)).toContain('На историю остаётся 30 208 из 32 256 токенов');

    fireEvent.change(limitInput(), { target: { value: '32256' } });

    expect(plain(document.body.textContent)).toContain('На историю остаётся 0 из 32 256 токенов');
  });

  it('ignores an emptied field instead of saving a limit of one token', async () => {
    const onChange = vi.fn();
    await renderWithProviders(<Harness contextLength={8192} initial={600} onChange={onChange} />);

    fireEvent.change(limitInput(), { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(plain(document.body.textContent)).toContain('Нужно целое число от 1 до 10 000 000');
  });

  it('names a fraction or zero as invalid instead of keeping the old limit silently', async () => {
    const onChange = vi.fn();
    await renderWithProviders(<Harness contextLength={8192} initial={600} onChange={onChange} />);

    fireEvent.change(limitInput(), { target: { value: '1.5' } });

    expect(limitInput().value).toBe('1.5');
    expect(plain(document.body.textContent)).toContain('Нужно целое число');

    fireEvent.change(limitInput(), { target: { value: '700' } });

    expect(onChange).toHaveBeenLastCalledWith(700);
    expect(plain(document.body.textContent)).not.toContain('Нужно целое число');
  });
});
