import type { ReactNode } from 'react';

export interface FieldProps {
  children: ReactNode;
  hint?: string;
  id: string;
  label: string;
  required?: boolean;
}

export function Field({ children, hint, id, label, required }: FieldProps) {
  return (
    <div className="field">
      <label className="between" htmlFor={id}>
        <span>
          {label}
          {required ? <span style={{ color: 'var(--danger)' }}> *</span> : null}
        </span>
      </label>
      {children}
      {hint ? (
        <div className="muted" style={{ fontSize: 'var(--fz-2xs)', marginTop: 4 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
