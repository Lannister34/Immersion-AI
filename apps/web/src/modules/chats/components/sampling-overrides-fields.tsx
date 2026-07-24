import {
  type InheritedSampling,
  NUMERIC_SAMPLING_FIELDS,
  type NumericSamplingField,
  resolveSliderRange,
  type SamplingOverrideErrors,
  type SamplingOverrideKey,
  type SamplingOverridesDraft,
} from '../view-models/sampling-overrides';

export interface SamplingOverridesFieldsProps {
  disabled: boolean;
  draft: SamplingOverridesDraft;
  errors: SamplingOverrideErrors;
  /** Значения пресета: показываем их, пока чат не переопределил поле. */
  inherited: InheritedSampling | undefined;
  /** immediate — для дискретных действий: их не нужно ждать после паузы. */
  onChange: (key: SamplingOverrideKey, value: string, options?: { immediate?: boolean }) => void;
}

function OverrideDot() {
  return (
    <span
      style={{
        background: 'var(--accent)',
        borderRadius: '50%',
        display: 'inline-block',
        height: 5,
        width: 5,
      }}
      title="Переопределено для этого чата"
    />
  );
}

export function SamplingOverridesFields({
  disabled,
  draft,
  errors,
  inherited,
  onChange,
}: SamplingOverridesFieldsProps) {
  const renderNumericField = (field: NumericSamplingField) => {
    const raw = draft[field.key].trim();
    const isOverridden = raw.length > 0;
    const error = errors[field.key];
    const inheritedValue = inherited?.[field.key];
    const numericValue = Number(raw.replace(',', '.'));
    const sliderValue = Number.isFinite(numericValue) ? numericValue : (inheritedValue ?? field.slider.min);
    const sliderRange = resolveSliderRange(field, sliderValue);

    const handleToggle = (enabled: boolean) => {
      // Включение стартует от значения, которое действует сейчас, — правка
      // всегда начинается с понятной точки, а не с нуля.
      onChange(field.key, enabled ? String(inheritedValue ?? field.slider.min) : '', { immediate: true });
    };

    return (
      <div className="col" key={field.key} style={{ gap: 3 }}>
        <div className="row gap-6" style={{ alignItems: 'center' }}>
          <input
            aria-label={`Переопределить ${field.label}`}
            checked={isOverridden}
            disabled={disabled}
            onChange={(event) => handleToggle(event.currentTarget.checked)}
            type="checkbox"
          />
          <span
            className="mono row gap-4"
            style={{
              alignItems: 'center',
              color: isOverridden ? 'var(--text)' : 'var(--muted)',
              flex: 1,
              fontSize: 'var(--fz-2xs)',
              minWidth: 0,
            }}
          >
            <span className="truncate">{field.label}</span>
            {isOverridden ? <OverrideDot /> : null}
          </span>
          <input
            className="input mono tnum"
            disabled={disabled || !isOverridden}
            inputMode="decimal"
            onChange={(event) => {
              const { value } = event.currentTarget;
              onChange(field.key, value);
            }}
            placeholder={inheritedValue === undefined ? '—' : String(inheritedValue)}
            step={field.step}
            style={{ fontSize: 'var(--fz-2xs)', padding: '2px 6px', textAlign: 'right', width: 68 }}
            type="number"
            value={raw}
          />
        </div>
        {isOverridden ? (
          <input
            aria-label={field.label}
            className="range"
            disabled={disabled}
            max={sliderRange.max}
            min={sliderRange.min}
            onChange={(event) => {
              const { value } = event.currentTarget;
              onChange(field.key, value);
            }}
            step={sliderRange.step}
            type="range"
            value={sliderValue}
          />
        ) : null}
        {error ? <span style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>{error}</span> : null}
      </div>
    );
  };

  const isTrimOverridden = draft.contextTrimStrategy.length > 0;

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row gap-6" style={{ alignItems: 'center' }}>
        <input
          aria-label="Переопределить стратегию обрезки"
          checked={isTrimOverridden}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              'contextTrimStrategy',
              event.currentTarget.checked ? (inherited?.contextTrimStrategy ?? 'trim_middle') : '',
              { immediate: true },
            )
          }
          type="checkbox"
        />
        <span
          className="mono row gap-4"
          style={{
            alignItems: 'center',
            color: isTrimOverridden ? 'var(--text)' : 'var(--muted)',
            flex: 1,
            fontSize: 'var(--fz-2xs)',
            minWidth: 0,
          }}
        >
          <span className="truncate">trim</span>
          {isTrimOverridden ? <OverrideDot /> : null}
        </span>
        <select
          aria-label="Стратегия обрезки контекста"
          className="input mono"
          disabled={disabled || !isTrimOverridden}
          onChange={(event) => {
            const { value } = event.currentTarget;
            onChange('contextTrimStrategy', value, { immediate: true });
          }}
          style={{ fontSize: 'var(--fz-2xs)', padding: '2px 4px', width: 110 }}
          value={isTrimOverridden ? draft.contextTrimStrategy : (inherited?.contextTrimStrategy ?? 'trim_middle')}
        >
          <option value="trim_middle">trim_middle</option>
          <option value="trim_start">trim_start</option>
        </select>
      </div>
      {NUMERIC_SAMPLING_FIELDS.map(renderNumericField)}
    </div>
  );
}
