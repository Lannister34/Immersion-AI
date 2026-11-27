import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type NarrowChatSheet, useNarrowChatSheet } from './use-narrow-chat-sheet';

function renderSheet(initial: Omit<NarrowChatSheet, 'close'>) {
  const close = vi.fn<() => void>();
  const rendered = renderHook((props: Omit<NarrowChatSheet, 'close'>) => useNarrowChatSheet({ ...props, close }), {
    initialProps: initial,
  });
  return { close, rendered };
}

describe('useNarrowChatSheet', () => {
  it('leaves the docked panel alone on a desktop viewport, Escape included', () => {
    const { close } = renderSheet({ isNarrowViewport: false, isOpen: true });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(close).not.toHaveBeenCalled();
  });

  it('closes the panel when the viewport narrows to a phone, so the sheet does not suddenly cover the chat', () => {
    const { close, rendered } = renderSheet({ isNarrowViewport: false, isOpen: true });

    rendered.rerender({ isNarrowViewport: true, isOpen: true });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes an open sheet on Escape on a phone', () => {
    const { close, rendered } = renderSheet({ isNarrowViewport: true, isOpen: false });
    rendered.rerender({ isNarrowViewport: true, isOpen: true });
    close.mockClear();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(close).toHaveBeenCalledTimes(1);
  });
});
