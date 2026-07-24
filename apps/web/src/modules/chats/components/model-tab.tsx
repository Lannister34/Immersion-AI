import type { SettingsOverviewResponse } from '@immersion/contracts/settings';

import { UndoIcon } from '../../../shared/ui/icons';
import {
  type AutoSavedGenerationSettings,
  INHERIT_PRESET_VALUE,
} from '../mutations/use-auto-saved-generation-settings';
import {
  CONTEXT_TRIM_FIELD,
  countSamplingOverrides,
  describeContextTrimStrategy,
  type InheritedSampling,
  toSamplingFieldViewModels,
} from '../view-models/sampling-overrides';
import { MarkDot } from './mark-dot';
import { SaveAsPresetForm } from './save-as-preset-form';
import { SaveErrorLine } from './save-error-line';

export interface ModelTabProps {
  /** Значения, которые реально уходят в модель: запасной источник подсказок. */
  effectiveSampling: InheritedSampling | undefined;
  form: AutoSavedGenerationSettings;
  /** Пресет, привязанный к загруженной модели; null — привязки нет. */
  modelBindingPresetId: string | null;
  settings: SettingsOverviewResponse | undefined;
}

interface UndoButtonProps {
  inheritedText: string;
  onClick: () => void;
}

function UndoButton({ inheritedText, onClick }: UndoButtonProps) {
  return (
    <button
      className="rp-param__undo"
      onClick={onClick}
      title={inheritedText.length > 0 ? `Вернуть ${inheritedText} из набора` : 'Вернуть значение из набора'}
      type="button"
    >
      <UndoIcon size={13} />
    </button>
  );
}

export function ModelTab({ effectiveSampling, form, modelBindingPresetId, settings }: ModelTabProps) {
  const presets = settings?.sampler.presets ?? [];
  const inheritedPresetId = modelBindingPresetId ?? settings?.sampler.activePresetId ?? null;
  const inheritedSuffix = modelBindingPresetId ? ' — от модели' : ' — из настроек';
  const pinnedPresetId = form.draft.samplerPresetId;
  // Пустая привязка означает «тот набор, который сейчас даёт модель или настройки»,
  // поэтому в списке он и стоит на месте своего пресета, а не отдельной строкой.
  const baselinePresetId = pinnedPresetId === INHERIT_PRESET_VALUE ? inheritedPresetId : pinnedPresetId;
  const baseline: InheritedSampling | undefined =
    presets.find((preset) => preset.id === baselinePresetId) ?? effectiveSampling;
  const rows = toSamplingFieldViewModels(form.draft.sampling, form.errors, baseline);
  const hasOverrides = countSamplingOverrides(form.draft.sampling) > 0 || pinnedPresetId !== INHERIT_PRESET_VALUE;

  const trimRaw = form.draft.sampling.contextTrimStrategy;
  const isTrimOverridden = trimRaw.length > 0;
  const trimValue = isTrimOverridden ? trimRaw : (baseline?.contextTrimStrategy ?? 'trim_middle');

  return (
    <div className="col gap-14" style={{ padding: 14 }}>
      <div className="col gap-6">
        <div className="row gap-6" style={{ alignItems: 'center', minHeight: 20 }}>
          <label
            htmlFor="chat-sampler-preset"
            style={{ color: 'var(--muted)', fontSize: 'var(--fz-xs)', fontWeight: 500 }}
          >
            Предустановка
          </label>
          {hasOverrides ? <MarkDot title="Есть значения, изменённые в этом чате" /> : null}
          <span style={{ flex: 1 }} />
          {hasOverrides ? (
            <button className="btn btn--xs btn--ghost-bordered" onClick={form.resetModelOverrides} type="button">
              Сбросить изменения
            </button>
          ) : null}
        </div>
        <select
          className="input"
          disabled={presets.length === 0}
          id="chat-sampler-preset"
          onChange={(event) => {
            const { value } = event.currentTarget;
            form.setSamplerPresetId(value);
          }}
          value={pinnedPresetId}
        >
          {presets.map((preset) => {
            const isInherited = preset.id === inheritedPresetId;
            return (
              <option key={preset.id} value={isInherited ? INHERIT_PRESET_VALUE : preset.id}>
                {isInherited ? `${preset.name}${inheritedSuffix}` : preset.name}
              </option>
            );
          })}
        </select>
      </div>

      <div className="col">
        {rows.map(({ error, field, inheritedText, isOverridden, value }) => (
          <div className="rp-param" data-overridden={isOverridden ? 'true' : 'false'} key={field.key}>
            <label htmlFor={`chat-sampling-${field.key}`} style={{ minWidth: 0 }}>
              <span className="rp-param__name" style={{ display: 'block' }}>
                {field.label}
              </span>
              <span className="rp-param__hint" style={{ display: 'block' }}>
                {error ?? field.hint}
              </span>
            </label>
            <input
              className="rp-param__value"
              id={`chat-sampling-${field.key}`}
              inputMode="decimal"
              onChange={(event) => {
                const { value: next } = event.currentTarget;
                form.setSampling(field.key, next);
              }}
              type="text"
              value={value}
            />
            <UndoButton
              inheritedText={inheritedText}
              onClick={() => form.setSampling(field.key, '', { immediate: true })}
            />
          </div>
        ))}
        <div className="rp-param rp-param--wide" data-overridden={isTrimOverridden ? 'true' : 'false'}>
          <label htmlFor="chat-sampling-trim" style={{ minWidth: 0 }}>
            <span className="rp-param__name" style={{ display: 'block' }}>
              {CONTEXT_TRIM_FIELD.label}
            </span>
            <span className="rp-param__hint" style={{ display: 'block' }}>
              {CONTEXT_TRIM_FIELD.hint}
            </span>
          </label>
          <select
            className="rp-param__select"
            id="chat-sampling-trim"
            onChange={(event) => {
              const { value } = event.currentTarget;
              form.setSampling('contextTrimStrategy', value, { immediate: true });
            }}
            value={trimValue}
          >
            {CONTEXT_TRIM_FIELD.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <UndoButton
            inheritedText={baseline ? describeContextTrimStrategy(baseline.contextTrimStrategy) : ''}
            onClick={() => form.setSampling('contextTrimStrategy', '', { immediate: true })}
          />
        </div>
      </div>

      <SaveErrorLine saveError={form.saveError} />
      {hasOverrides ? (
        <SaveAsPresetForm
          baselinePresetName={presets.find((preset) => preset.id === baselinePresetId)?.name ?? 'Набор'}
          effectiveSampling={effectiveSampling}
          form={form}
        />
      ) : null}
    </div>
  );
}
