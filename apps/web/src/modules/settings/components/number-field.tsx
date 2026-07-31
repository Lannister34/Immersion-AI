export interface NumberFieldProps {
  id: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}

export function NumberField({ id, label, max, min, onChange, step, value }: NumberFieldProps) {
  return (
    <div className="field">
      <label
        className="muted"
        htmlFor={id}
        style={{ fontSize: 'var(--fz-2xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {label}
      </label>
      <input
        className="input mono"
        id={id}
        max={max}
        min={min}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        step={step ?? 1}
        type="number"
        value={value}
      />
    </div>
  );
}
