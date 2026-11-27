import { useEffect } from 'react';

export interface NarrowChatSheet {
  close: () => void;
  isNarrowViewport: boolean;
  isOpen: boolean;
}

export function useNarrowChatSheet({ close, isNarrowViewport, isOpen }: NarrowChatSheet): void {
  useEffect(() => {
    if (isNarrowViewport) {
      close();
    }
  }, [close, isNarrowViewport]);

  useEffect(() => {
    if (!isNarrowViewport || !isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, isNarrowViewport, isOpen]);
}
