import type { ReactNode } from 'react';

export interface FieldProps {
  action?: ReactNode;
  children: ReactNode;
  hint?: string;
  id: string;
  label: string;
  required?: boolean;
}

export function Field({ action, children, hint, id, label, required }: FieldProps) {
  return (
    <div className="field">
      <div className="between">
        <label htmlFor={id}>
          <span>
            {label}
            {required ? <span style={{ color: 'var(--danger)' }}> *</span> : null}
          </span>
        </label>
        {action}
      </div>
      {children}
      {hint ? (
        <div className="muted" style={{ fontSize: 'var(--fz-2xs)', marginTop: 4 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
