export interface ToggleRowProps {
  checked: boolean;
  hint: string;
  id: string;
  label: string;
  onChange: (value: boolean) => void;
}

export function ToggleRow({ checked, hint, id, label, onChange }: ToggleRowProps) {
  return (
    <label className="between" htmlFor={id} style={{ cursor: 'pointer' }}>
      <div>
        <strong>{label}</strong>
        <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          {hint}
        </div>
      </div>
      <input checked={checked} id={id} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />
    </label>
  );
}
