import type { ReactNode } from 'react';

type ErrorBannerTone = 'card' | 'soft';

interface ErrorBannerProps {
  children: ReactNode;
  tone?: ErrorBannerTone;
}

const TONE_CLASS_NAMES: Record<ErrorBannerTone, string> = {
  card: 'card alert alert--danger',
  soft: 'card alert alert--soft',
};

export function ErrorBanner({ children, tone = 'card' }: ErrorBannerProps) {
  return (
    <div className={TONE_CLASS_NAMES[tone]} role="alert">
      {children}
    </div>
  );
}
