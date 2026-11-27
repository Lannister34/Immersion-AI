import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { ChevronRightIcon } from '../../shared/ui/icons';
import { useMobileNavStore } from '../store/mobile-nav';

type CrumbPath = '/chat' | '/characters' | '/scenarios' | '/lorebooks' | '/settings' | '/server';

interface TopbarCrumb {
  label: string;
  strong?: boolean;
  to?: CrumbPath;
}

interface CrumbProps {
  crumb: TopbarCrumb;
}

function Crumb({ crumb }: CrumbProps) {
  const label = crumb.strong ? <strong>{crumb.label}</strong> : <span>{crumb.label}</span>;

  return crumb.to ? <Link to={crumb.to}>{label}</Link> : label;
}

function MenuGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={18}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.7}
      viewBox="0 0 24 24"
      width={18}
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

interface TopbarProps {
  crumbs: TopbarCrumb[];
  actions?: ReactNode;
}

export function Topbar({ crumbs, actions }: TopbarProps) {
  const openMobileNav = useMobileNavStore((state) => state.open);
  const isMobileNavOpen = useMobileNavStore((state) => state.isOpen);

  return (
    <div className="topbar">
      <button
        aria-expanded={isMobileNavOpen}
        aria-label="Открыть меню"
        className="btn btn--icon topbar__menu"
        onClick={openMobileNav}
        type="button"
      >
        <MenuGlyph />
      </button>
      <div className="topbar__crumbs">
        {crumbs.map((c, i) => (
          <span className="topbar__crumb" key={`${c.label}-${i}`}>
            {i > 0 ? (
              <span className="sep">
                <ChevronRightIcon size={12} />
              </span>
            ) : null}
            <Crumb crumb={c} />
          </span>
        ))}
      </div>
      <div className="topbar__actions">{actions}</div>
    </div>
  );
}
