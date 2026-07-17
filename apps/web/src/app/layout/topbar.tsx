import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { ChevronRightIcon, SearchIcon } from '../../shared/ui/icons';

export type CrumbPath = '/chat' | '/characters' | '/scenarios' | '/lorebooks' | '/settings' | '/server';

export interface Crumb {
  label: string;
  strong?: boolean;
  to?: CrumbPath;
}

interface TopbarSearch {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

interface TopbarProps {
  crumbs: Crumb[];
  actions?: ReactNode;
  search?: TopbarSearch | false;
}

const defaultSearch: TopbarSearch = { placeholder: 'Поиск или команда…' };

function renderCrumb(crumb: Crumb) {
  const label = crumb.strong ? <strong>{crumb.label}</strong> : <span>{crumb.label}</span>;

  return crumb.to ? <Link to={crumb.to}>{label}</Link> : label;
}

export function Topbar({ crumbs, actions, search = defaultSearch }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="topbar__crumbs">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {i > 0 ? (
              <span className="sep">
                <ChevronRightIcon size={12} />
              </span>
            ) : null}
            {renderCrumb(c)}
          </span>
        ))}
      </div>
      <div className="topbar__actions">
        {search === false ? null : (
          <div className="search">
            <SearchIcon size={14} />
            <input
              defaultValue={search.value ?? ''}
              onChange={(event) => search.onChange?.(event.currentTarget.value)}
              placeholder={search.placeholder ?? 'Поиск или команда…'}
            />
            <span className="kbd">⌘K</span>
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}
