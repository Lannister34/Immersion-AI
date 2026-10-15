import { Link } from '@tanstack/react-router';

import {
  BookIcon,
  ChatIcon,
  ChevronRightIcon,
  EditIcon,
  ServerIcon,
  SettingsIcon,
  TheaterIcon,
  UserIcon,
} from '../../shared/ui/icons';
import { SidebarLink, type SidebarLinkPath, type SidebarNavItem } from './sidebar-link';

export type RuntimeBadgeStatus = 'running' | 'stopped' | 'starting' | 'error';

interface RuntimeBadge {
  status: RuntimeBadgeStatus;
  label: string;
  detail?: string | undefined;
}

interface PersonaBadge {
  initial: string;
  name: string;
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
        <div className="sb__logo">AI</div>
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
          <Link className="sb__user" title="Открыть настройки профиля" to="/settings">
            <div className="sb__avatar">{persona.initial}</div>
            <div className="truncate" style={{ flex: 1, minWidth: 0 }}>
              <div className="truncate" style={{ fontWeight: 600, fontSize: 'var(--fz-sm)' }}>
                {persona.name}
              </div>
              <div style={{ color: 'var(--muted-dim)', fontSize: 'var(--fz-2xs)' }}>ваш профиль</div>
            </div>
            <EditIcon size={13} />
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
