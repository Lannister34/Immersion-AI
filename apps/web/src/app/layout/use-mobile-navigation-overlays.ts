import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { NARROW_VIEWPORT_QUERY } from '../../shared/lib/media-queries';
import { useMobileNavStore } from '../store/mobile-nav';
import { useUiShellStore } from '../store/ui-shell';

export interface MobileNavigationOverlays {
  closeMobileNav: () => void;
  isMobileNavOpen: boolean;
}

export function useMobileNavigationOverlays(): MobileNavigationOverlays {
  const isMobileNavOpen = useMobileNavStore((state) => state.isOpen);
  const closeMobileNav = useMobileNavStore((state) => state.close);
  const closeChatRightPanel = useUiShellStore((state) => state.closeChatRightPanel);
  const router = useRouter();

  useEffect(
    () =>
      router.subscribe('onResolved', () => {
        closeMobileNav();
        if (window.matchMedia(NARROW_VIEWPORT_QUERY).matches) {
          closeChatRightPanel();
        }
      }),
    [closeChatRightPanel, closeMobileNav, router],
  );

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMobileNav();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeMobileNav, isMobileNavOpen]);

  return { closeMobileNav, isMobileNavOpen };
}
