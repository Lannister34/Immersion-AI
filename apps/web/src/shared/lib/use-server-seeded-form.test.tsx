import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useServerSeededForm } from './use-server-seeded-form';

interface Draft {
  name: string;
}

const sameDraft = (left: Draft, right: Draft): boolean => left.name === right.name;

function renderSeededForm(initial: Draft) {
  return renderHook(({ baseline }) => useServerSeededForm(baseline, sameDraft), {
    initialProps: { baseline: initial },
  });
}

describe('useServerSeededForm', () => {
  it('adopts a new server value while the form is untouched', () => {
    const view = renderSeededForm({ name: 'Маяк' });

    view.rerender({ baseline: { name: 'Гавань' } });

    expect(view.result.current[0]).toEqual({ name: 'Гавань' });
  });

  it('keeps the edits when the server value changes under them', () => {
    const view = renderSeededForm({ name: 'Маяк' });

    act(() => view.result.current[1]({ name: 'Шхуна' }));
    view.rerender({ baseline: { name: 'Гавань' } });

    expect(view.result.current[0]).toEqual({ name: 'Шхуна' });
  });

  it('ignores a new object that carries the same server value, as a poll returns', () => {
    const view = renderSeededForm({ name: 'Маяк' });

    act(() => view.result.current[1]({ name: 'Шхуна' }));
    view.rerender({ baseline: { name: 'Маяк' } });
    view.rerender({ baseline: { name: 'Гавань' } });

    expect(view.result.current[0]).toEqual({ name: 'Шхуна' });
  });
});
