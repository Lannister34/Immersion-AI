import { Link } from '@tanstack/react-router';

export type CrumbPath = '/chat' | '/characters' | '/scenarios' | '/lorebooks' | '/settings' | '/server';

export interface Crumb {
  label: string;
  strong?: boolean;
  to?: CrumbPath;
}

export function renderCrumb(crumb: Crumb) {
  const label = crumb.strong ? <strong>{crumb.label}</strong> : <span>{crumb.label}</span>;

  return crumb.to ? <Link to={crumb.to}>{label}</Link> : label;
}
