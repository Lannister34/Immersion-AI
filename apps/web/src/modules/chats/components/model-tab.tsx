import { type ReplyTokenLimit, UNLIMITED_REPLY_TOKENS } from '@immersion/contracts/common';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { Fragment } from 'react';

import { UndoIcon } from '../../../shared/ui/icons';
import { CONTEXT_TRIM_FIELD, DEFAULT_REPLY_TOKEN_LIMIT, describeReplyBudget } from '../../settings';
import {
  type AutoSavedGenerationSettings,
  INHERIT_PRESET_VALUE,
} from '../mutations/use-auto-saved-generation-settings';
import type { PendingRuntimeContext } from '../view-models/pending-runtime-context';
import {
  countSamplingOverrides,
  describeContextTrimStrategy,
  type InheritedSampling,
  type SamplingFieldViewModel,
  stepSamplingValue,
  toSamplingFieldViewModels,
} from '../view-models/sampling-overrides';
import { MarkDot } from './mark-dot';
import { PendingContextNotice } from './pending-context-notice';
import { SaveAsPresetForm } from './save-as-preset-form';
import { SaveErrorLine } from './save-error-line';

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

interface ReplyLimitControlsProps {
  contextLength: number;
  inheritedLimit: ReplyTokenLimit | undefined;
  onChange: (value: string) => void;
  row: SamplingFieldViewModel;
}

function ReplyLimitControls({ contextLength, inheritedLimit, onChange, row }: ReplyLimitControlsProps) {
  const parsed = Number(row.value);
  let limit: ReplyTokenLimit | null = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  if (row.isUnlimited) {
    limit = UNLIMITED_REPLY_TOKENS;
  }

  const hint = limit === null ? null : describeReplyBudget(contextLength, limit);
  const restoredLimit = typeof inheritedLimit === 'number' ? '' : String(DEFAULT_REPLY_TOKEN_LIMIT);

  return (
    <div className="col gap-4" style={{ padding: '0 0 8px' }}>
      <label className="row gap-6" style={{ alignItems: 'center', fontSize: 'var(--fz-xs)' }}>
        <input
          checked={row.isUnlimited}
          onChange={(event) => {
            onChange(event.currentTarget.checked ? UNLIMITED_REPLY_TOKENS : restoredLimit);
          }}
          type="checkbox"
        />
        Без лимита
      </label>
      {hint ? (
        <span className="rp-param__hint" style={hint.tone === 'warn' ? { color: 'var(--warn)' } : undefined}>
          {hint.text}
        </span>
      ) : null}
    </div>
  );
}

interface ModelTabProps {
  effectiveSampling: InheritedSampling | undefined;
  form: AutoSavedGenerationSettings;
  isContextDraftSaved?: boolean;
  modelBindingPresetId: string | null;
  pendingRuntimeContext?: PendingRuntimeContext | null;
  settings: SettingsOverviewResponse | undefined;
}

export function ModelTab({
  effectiveSampling,
  form,
  isContextDraftSaved = true,
  modelBindingPresetId,
  pendingRuntimeContext = null,
  settings,
}: ModelTabProps) {
  const presets = settings?.sampler.presets ?? [];
  const inheritedPresetId = modelBindingPresetId ?? settings?.sampler.activePresetId ?? null;
  const inheritedSuffix = modelBindingPresetId ? ' — от модели' : ' — из настроек';
  const pinnedPresetId = form.draft.samplerPresetId;
  const baselinePresetId = pinnedPresetId === INHERIT_PRESET_VALUE ? inheritedPresetId : pinnedPresetId;
  const baseline: InheritedSampling | undefined =
    presets.find((preset) => preset.id === baselinePresetId) ?? effectiveSampling;
  const rows = toSamplingFieldViewModels(form.draft.sampling, form.errors, baseline);
  const contextRow = rows.find((row) => row.field.key === 'maxContextLength');
  const effectiveContextLength = Number(contextRow?.value ?? baseline?.maxContextLength ?? 0) || 0;
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
          autoComplete="off"
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

      {pendingRuntimeContext ? (
        <PendingContextNotice isDraftSaved={isContextDraftSaved} {...pendingRuntimeContext} />
      ) : null}

      <div className="col">
        {rows.map((row) => {
          const { error, field, inheritedText, isOverridden, isUnlimited, value } = row;
          const step = (direction: 1 | -1) => {
            form.setSampling(field.key, stepSamplingValue(field, value, direction, baseline?.[field.key]));
          };

          return (
            <Fragment key={field.key}>
              <div className="rp-param" data-overridden={isOverridden ? 'true' : 'false'}>
                <label htmlFor={`chat-sampling-${field.key}`} style={{ minWidth: 0 }}>
                  <span className="rp-param__name" style={{ display: 'block' }}>
                    {field.label}
                  </span>
                  <span className="rp-param__hint" style={{ display: 'block' }}>
                    {error ?? field.hint}
                  </span>
                </label>
                <div className="rp-param__stepper">
                  <button
                    aria-label={`Уменьшить ${field.label} на ${field.step}`}
                    className="rp-param__step"
                    onClick={() => step(-1)}
                    type="button"
                  >
                    −
                  </button>
                  <input
                    autoComplete="off"
                    className="rp-param__value"
                    id={`chat-sampling-${field.key}`}
                    inputMode="decimal"
                    onChange={(event) => {
                      const { value: next } = event.currentTarget;
                      form.setSampling(field.key, next);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        step(event.key === 'ArrowUp' ? 1 : -1);
                      }
                    }}
                    placeholder={isUnlimited ? 'без лимита' : undefined}
                    type="text"
                    value={value}
                  />
                  <button
                    aria-label={`Увеличить ${field.label} на ${field.step}`}
                    className="rp-param__step"
                    onClick={() => step(1)}
                    type="button"
                  >
                    +
                  </button>
                </div>
                <UndoButton
                  inheritedText={inheritedText}
                  onClick={() => form.setSampling(field.key, '', { immediate: true })}
                />
              </div>
              {field.key === 'maxTokens' ? (
                <ReplyLimitControls
                  contextLength={effectiveContextLength}
                  inheritedLimit={baseline?.maxTokens}
                  onChange={(next) => form.setSampling('maxTokens', next, { immediate: true })}
                  row={row}
                />
              ) : null}
            </Fragment>
          );
        })}
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
            autoComplete="off"
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
