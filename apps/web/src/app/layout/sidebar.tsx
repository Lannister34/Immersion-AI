import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import {
  BookIcon,
  ChatIcon,
  ChevronRightIcon,
  type IconProps,
  ServerIcon,
  SettingsIcon,
  TheaterIcon,
  UserIcon,
} from '../../shared/ui/icons';

export type RuntimeBadgeStatus = 'running' | 'stopped' | 'starting' | 'error';

interface RuntimeBadge {
  status: RuntimeBadgeStatus;
  label: string;
  detail?: string | undefined;
}

interface PersonaBadge {
  initial: string;
  name: string;
  hint?: string | undefined;
}

type SidebarLinkPath = '/chat' | '/characters' | '/scenarios' | '/lorebooks' | '/settings' | '/server';

interface SidebarNavItem {
  to: SidebarLinkPath;
  label: string;
  icon: (props: IconProps) => ReactNode;
}

const workspaceItems: SidebarNavItem[] = [
  { to: '/chat', label: 'Чаты', icon: ChatIcon },
  { to: '/characters', label: 'Персонажи', icon: UserIcon },
  { to: '/scenarios', label: 'Сценарии', icon: TheaterIcon },
  { to: '/lorebooks', label: 'Лорбуки', icon: BookIcon },
];

const systemItems: SidebarNavItem[] = [
  { to: '/settings', label: 'Настройки', icon: SettingsIcon },
  { to: '/server', label: 'API / Сервер', icon: ServerIcon },
];

interface SidebarProps {
  runtime: RuntimeBadge;
  persona?: PersonaBadge | undefined;
  workspaceCounts?: Partial<Record<SidebarLinkPath, number | undefined>> | undefined;
}

const dotClassByStatus: Record<RuntimeBadgeStatus, string> = {
  running: 'dot dot--running',
  stopped: 'dot dot--idle',
  starting: 'dot dot--pulse',
  error: 'dot dot--danger',
};

export function Sidebar({ runtime, persona, workspaceCounts }: SidebarProps) {
  return (
    <aside className="sb">
      <div className="sb__brand">
        <div className="sb__logo">IA</div>
        <div className="sb__brand-name">Immersion</div>
        <span className="sb__brand-meta">v0.4</span>
      </div>

      <div className="sb__section">Воркспейс</div>
      <nav className="sb__nav">
        {workspaceItems.map((item) => (
          <SidebarLink count={workspaceCounts?.[item.to]} item={item} key={item.to} />
        ))}
      </nav>

      <div className="sb__section">Система</div>
      <nav className="sb__nav">
        {systemItems.map((item) => (
          <SidebarLink item={item} key={item.to} />
        ))}
      </nav>

      <div className="sb__spacer" />

      <div className="sb__footer">
        <Link className="sb__status" title="Открыть /server" to="/server">
          <span className={dotClassByStatus[runtime.status]} />
          <div className="sb__status-text">
            <strong className="truncate">{runtime.label}</strong>
            {runtime.detail ? <span className="truncate">{runtime.detail}</span> : null}
          </div>
          <ChevronRightIcon size={14} />
        </Link>
        {persona ? (
          <div className="sb__user">
            <div className="sb__avatar">{persona.initial}</div>
            <div className="truncate">
              <div style={{ fontWeight: 600, fontSize: 'var(--fz-sm)' }}>{persona.name}</div>
              {persona.hint ? (
                <div style={{ color: 'var(--muted-dim)', fontSize: 'var(--fz-2xs)' }}>{persona.hint}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

interface SidebarLinkProps {
  item: SidebarNavItem;
  count?: number | undefined;
}

function SidebarLink({ item, count }: SidebarLinkProps) {
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
