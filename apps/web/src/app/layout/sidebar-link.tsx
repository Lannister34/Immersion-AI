import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import type { IconProps } from '../../shared/ui/icons';

export type SidebarLinkPath = '/chat' | '/characters' | '/scenarios' | '/lorebooks' | '/settings' | '/server';

export interface SidebarNavItem {
  to: SidebarLinkPath;
  label: string;
  icon: (props: IconProps) => ReactNode;
}

interface SidebarLinkProps {
  item: SidebarNavItem;
  count?: number | undefined;
}

export function SidebarLink({ item, count }: SidebarLinkProps) {
  const IconComponent = item.icon;
  return (
    <Link activeProps={{ 'aria-current': 'page' }} className="sb__link" to={item.to}>
      <span className="sb__icon">
        <IconComponent size={16} />
      </span>
      <span className="truncate">{item.label}</span>
      {typeof count === 'number' ? <span className="sb__link__count tnum">{count}</span> : <span />}
    </Link>
  );
}
