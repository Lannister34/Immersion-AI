import { XIcon } from '../../../shared/ui/icons';
import {
  type InheritedSampling,
  NUMERIC_SAMPLING_FIELDS,
  type SamplingOverrideErrors,
  type SamplingOverrideKey,
  type SamplingOverridesDraft,
} from '../view-models/sampling-overrides';

export interface SamplingOverridesFieldsProps {
  disabled: boolean;
  draft: SamplingOverridesDraft;
  errors: SamplingOverrideErrors;
  /** Значения пресета: показываем их подсказкой, пока чат не переопределил поле. */
  inherited: InheritedSampling | undefined;
  onChange: (key: SamplingOverrideKey, value: string) => void;
}

const TRIM_STRATEGY_LABELS: Record<InheritedSampling['contextTrimStrategy'], string> = {
  trim_middle: 'trim_middle',
  trim_start: 'trim_start',
};

export function SamplingOverridesFields({
  disabled,
  draft,
  errors,
  inherited,
  onChange,
}: SamplingOverridesFieldsProps) {
  const renderRow = (key: SamplingOverrideKey, label: string, control: React.ReactNode) => {
    const isOverridden = draft[key].trim().length > 0;
    const error = errors[key];

    return (
      <div className="col" key={key} style={{ gap: 2 }}>
        <div className="row gap-6" style={{ alignItems: 'center' }}>
          <span
            className="mono"
            style={{ color: isOverridden ? 'var(--text)' : 'var(--muted)', flex: 1, fontSize: 'var(--fz-2xs)' }}
          >
            {label}
          </span>
          {control}
          <button
            className="btn btn--icon btn--xs"
            disabled={disabled || !isOverridden}
            onClick={() => onChange(key, '')}
            style={{ opacity: isOverridden ? 1 : 0.25 }}
            title="Вернуть значение пресета"
            type="button"
          >
            <XIcon size={10} />
          </button>
        </div>
        {error ? <span style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>{error}</span> : null}
      </div>
    );
  };

  const inheritedTrim = inherited ? TRIM_STRATEGY_LABELS[inherited.contextTrimStrategy] : 'пресет';

  return (
    <div className="col" style={{ gap: 6 }}>
      {renderRow(
        'contextTrimStrategy',
        'trim',
        <select
          className="input mono"
          disabled={disabled}
          onChange={(event) => {
            const { value } = event.currentTarget;
            onChange('contextTrimStrategy', value);
          }}
          style={{
            borderColor: draft.contextTrimStrategy.length > 0 ? 'var(--accent)' : undefined,
            fontSize: 'var(--fz-2xs)',
            padding: '3px 6px',
            width: 110,
          }}
          value={draft.contextTrimStrategy}
        >
          <option value="">{`↳ ${inheritedTrim}`}</option>
          <option value="trim_middle">trim_middle</option>
          <option value="trim_start">trim_start</option>
        </select>,
      )}
      {NUMERIC_SAMPLING_FIELDS.map((field) =>
        renderRow(
          field.key,
          field.label,
          <input
            className="input mono tnum"
            disabled={disabled}
            inputMode="decimal"
            onChange={(event) => {
              const { value } = event.currentTarget;
              onChange(field.key, value);
            }}
            placeholder={inherited ? String(inherited[field.key]) : '—'}
            step={field.step}
            style={{
              borderColor: draft[field.key].trim().length > 0 ? 'var(--accent)' : undefined,
              fontSize: 'var(--fz-2xs)',
              padding: '3px 6px',
              textAlign: 'right',
              width: 110,
            }}
            type="number"
            value={draft[field.key]}
          />,
        ),
      )}
    </div>
  );
}
