import type { ReactNode } from 'react';

interface BindingRowProps {
  icon: ReactNode;
  label: string;
  value: string;
}

export function BindingRow({ icon, label, value }: BindingRowProps) {
  return (
    <div className="rp-binding">
      {icon}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--fz-sm)' }}>{label}</span>
        <span className="truncate" style={{ color: 'var(--muted-dim)', display: 'block', fontSize: 'var(--fz-xs)' }}>
          {value}
        </span>
      </span>
    </div>
  );
}
