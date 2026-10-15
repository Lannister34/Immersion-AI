import type { ReactNode } from 'react';

import { ChevronRightIcon } from '../../shared/ui/icons';
import { type Crumb, renderCrumb } from './render-crumb';

interface TopbarProps {
  crumbs: Crumb[];
  actions?: ReactNode;
}

export function Topbar({ crumbs, actions }: TopbarProps) {
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
      <div className="topbar__actions">{actions}</div>
    </div>
  );
}
