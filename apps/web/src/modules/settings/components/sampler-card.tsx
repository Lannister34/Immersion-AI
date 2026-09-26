import type { SamplerPresetInput, SettingsOverviewResponse } from '@immersion/contracts/settings';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { CheckIcon, PlusIcon, RefreshIcon, TrashIcon, XIcon } from '../../../shared/ui/icons';
import {
  useCreateSamplerPreset,
  useDeleteSamplerPreset,
  useSetActiveSamplerPreset,
  useUpdateSamplerPreset,
} from '../mutations/use-sampler-preset-mutations';
import { NumberField } from './number-field';

export interface SamplerCardProps {
  data: SettingsOverviewResponse;
}

type SamplerFormState = SamplerPresetInput;

function presetToForm(preset: SettingsOverviewResponse['sampler']['presets'][number]): SamplerFormState {
  return {
    contextTrimStrategy: preset.contextTrimStrategy,
    maxContextLength: preset.maxContextLength,
    maxTokens: preset.maxTokens,
    minP: preset.minP,
    name: preset.name,
    presencePenalty: preset.presencePenalty,
    repeatPenalty: preset.repeatPenalty,
    repeatPenaltyRange: preset.repeatPenaltyRange,
    temperature: preset.temperature,
    topK: preset.topK,
    topP: preset.topP,
  };
}

const DEFAULT_SAMPLER_VALUES = {
  contextTrimStrategy: 'trim_middle',
  maxContextLength: 8192,
  maxTokens: 600,
  minP: 0.02,
  presencePenalty: 0,
  repeatPenalty: 1.05,
  repeatPenaltyRange: 2048,
  temperature: 1,
  topK: 0,
  topP: 1,
} satisfies Omit<SamplerFormState, 'name'>;

function emptyForm(): SamplerFormState {
  return {
    ...DEFAULT_SAMPLER_VALUES,
    name: '',
  };
}

function formsEqual(left: SamplerFormState, right: SamplerFormState): boolean {
  return (
    left.contextTrimStrategy === right.contextTrimStrategy &&
    left.maxContextLength === right.maxContextLength &&
    left.maxTokens === right.maxTokens &&
    left.minP === right.minP &&
    left.name === right.name &&
    left.presencePenalty === right.presencePenalty &&
    left.repeatPenalty === right.repeatPenalty &&
    left.repeatPenaltyRange === right.repeatPenaltyRange &&
    left.temperature === right.temperature &&
    left.topK === right.topK &&
    left.topP === right.topP
  );
}

export function SamplerCard({ data }: SamplerCardProps) {
  const { sampler } = data;
  const [selectedId, setSelectedId] = useState<string | null>(sampler.activePresetId);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Keep selection valid when the underlying list changes (e.g., after delete).
  useEffect(() => {
    if (isCreating) return;
    if (selectedId && sampler.presets.some((preset) => preset.id === selectedId)) return;
    setSelectedId(sampler.activePresetId);
  }, [isCreating, sampler.activePresetId, sampler.presets, selectedId]);

  const selectedPreset = isCreating ? null : (sampler.presets.find((preset) => preset.id === selectedId) ?? null);
  const baseline = useMemo<SamplerFormState>(
    () => (selectedPreset ? presetToForm(selectedPreset) : emptyForm()),
    [selectedPreset],
  );
  const [form, setForm] = useState<SamplerFormState>(baseline);

  useEffect(() => {
    setForm(baseline);
    setConfirmDelete(false);
  }, [baseline]);

  const createMutation = useCreateSamplerPreset({
    onSuccess: (response) => {
      setIsCreating(false);
      setSelectedId(response.preset.id);
    },
  });
  const updateMutation = useUpdateSamplerPreset();
  const deleteMutation = useDeleteSamplerPreset({
    onSuccess: () => {
      setSelectedId(null);
      setConfirmDelete(false);
    },
  });
  const setActiveMutation = useSetActiveSamplerPreset();

  const isDirty = !formsEqual(form, baseline);
  const canSave =
    form.name.trim().length > 0 && (isCreating || isDirty) && !createMutation.isPending && !updateMutation.isPending;
  const onlyOnePreset = sampler.presets.length <= 1;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    if (isCreating) {
      createMutation.mutate({ ...form, name: form.name.trim() });
    } else if (selectedPreset) {
      updateMutation.mutate({ presetId: selectedPreset.id, command: { ...form, name: form.name.trim() } });
    }
  };

  const mutationError = createMutation.error ?? updateMutation.error ?? deleteMutation.error ?? setActiveMutation.error;
  const mutationErrorMessage = mutationError
    ? getApiErrorMessage(mutationError, 'Не удалось применить операцию.')
    : null;

  let setActiveLabel = 'Сделать активным';
  if (selectedPreset && selectedPreset.id === sampler.activePresetId) {
    setActiveLabel = 'активный';
  } else if (setActiveMutation.isPending) {
    setActiveLabel = '…';
  }

  let submitLabel = isCreating ? 'Создать preset' : 'Сохранить preset';
  if (createMutation.isPending || updateMutation.isPending) {
    submitLabel = 'Сохраняем…';
  }

  return (
    <section className="card" id="sampler" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>Sampler Presets</h2>
        <button
          className="btn btn--ghost-bordered btn--xs"
          disabled={isCreating}
          onClick={() => {
            setIsCreating(true);
            setSelectedId(null);
            setConfirmDelete(false);
          }}
          type="button"
        >
          <PlusIcon size={11} /> Новый preset
        </button>
      </div>
      <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
        {sampler.presets.map((preset) => {
          const isActive = preset.id === sampler.activePresetId;
          const isSelected = !isCreating && selectedId === preset.id;
          const className = `pill${isActive ? ' pill--accent' : ''}${isSelected ? ' pill--selected' : ''}`;
          return (
            <button
              className={className}
              key={preset.id}
              onClick={() => {
                setIsCreating(false);
                setSelectedId(preset.id);
                setConfirmDelete(false);
              }}
              style={{ cursor: 'pointer', outline: isSelected ? '1px solid var(--accent)' : 'none' }}
              type="button"
            >
              {isActive ? <CheckIcon size={10} /> : null}
              {preset.name}
            </button>
          );
        })}
        {isCreating ? (
          <span className="pill pill--accent" style={{ outline: '1px dashed var(--accent)' }}>
            новый preset
          </span>
        ) : null}
      </div>
      <form className="col gap-12" onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="sampler-name">Название</label>
            <input
              className="input"
              id="sampler-name"
              maxLength={120}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setForm((current) => ({ ...current, name: value }));
              }}
              placeholder="Например: Roleplay long"
              value={form.name}
            />
          </div>
          <div className="field">
            <label htmlFor="sampler-trim">Стратегия обрезки</label>
            <select
              className="input"
              id="sampler-trim"
              onChange={(event) => {
                const value = event.currentTarget.value as SamplerFormState['contextTrimStrategy'];
                setForm((current) => ({ ...current, contextTrimStrategy: value }));
              }}
              value={form.contextTrimStrategy}
            >
              <option value="trim_middle">trim_middle</option>
              <option value="trim_start">trim_start</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <NumberField
            id="sampler-temperature"
            label="temperature"
            max={10}
            min={0}
            onChange={(value) => setForm((current) => ({ ...current, temperature: value }))}
            step={0.05}
            value={form.temperature}
          />
          <NumberField
            id="sampler-top-p"
            label="top_p"
            max={1}
            min={0}
            onChange={(value) => setForm((current) => ({ ...current, topP: value }))}
            step={0.01}
            value={form.topP}
          />
          <NumberField
            id="sampler-top-k"
            label="top_k"
            max={10_000}
            min={0}
            onChange={(value) => setForm((current) => ({ ...current, topK: Math.round(value) }))}
            step={1}
            value={form.topK}
          />
          <NumberField
            id="sampler-min-p"
            label="min_p"
            max={1}
            min={0}
            onChange={(value) => setForm((current) => ({ ...current, minP: value }))}
            step={0.005}
            value={form.minP}
          />
          <NumberField
            id="sampler-rep-pen"
            label="rep_pen"
            max={10}
            min={0}
            onChange={(value) => setForm((current) => ({ ...current, repeatPenalty: value }))}
            step={0.01}
            value={form.repeatPenalty}
          />
          <NumberField
            id="sampler-rep-pen-range"
            label="rep_pen_range"
            max={10_000_000}
            min={0}
            onChange={(value) => setForm((current) => ({ ...current, repeatPenaltyRange: Math.round(value) }))}
            step={64}
            value={form.repeatPenaltyRange}
          />
          <NumberField
            id="sampler-presence"
            label="presence_penalty"
            max={5}
            min={-5}
            onChange={(value) => setForm((current) => ({ ...current, presencePenalty: value }))}
            step={0.05}
            value={form.presencePenalty}
          />
          <NumberField
            id="sampler-max-length"
            label="max_length"
            max={10_000_000}
            min={1}
            onChange={(value) => setForm((current) => ({ ...current, maxTokens: Math.max(1, Math.round(value)) }))}
            step={32}
            value={form.maxTokens}
          />
          <NumberField
            id="sampler-context"
            label="context"
            max={10_000_000}
            min={0}
            onChange={(value) => setForm((current) => ({ ...current, maxContextLength: Math.round(value) }))}
            step={512}
            value={form.maxContextLength}
          />
        </div>
        {mutationErrorMessage ? (
          <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 10 }}>
            {mutationErrorMessage}
          </div>
        ) : null}
        <div className="row gap-8" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="row gap-8">
            {!isCreating && selectedPreset ? (
              <>
                <button
                  className="btn btn--ghost-bordered btn--xs"
                  disabled={selectedPreset.id === sampler.activePresetId || setActiveMutation.isPending}
                  onClick={() => setActiveMutation.mutate(selectedPreset.id)}
                  type="button"
                >
                  {setActiveLabel}
                </button>
                {confirmDelete ? (
                  <>
                    <button
                      className="btn btn--danger btn--xs"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(selectedPreset.id)}
                      type="button"
                    >
                      {deleteMutation.isPending ? '…' : 'Подтвердить удаление'}
                    </button>
                    <button
                      className="btn btn--icon btn--xs"
                      disabled={deleteMutation.isPending}
                      onClick={() => setConfirmDelete(false)}
                      type="button"
                    >
                      <XIcon size={11} />
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn--icon btn--xs"
                    disabled={onlyOnePreset || deleteMutation.isPending}
                    onClick={() => setConfirmDelete(true)}
                    title={onlyOnePreset ? 'Нельзя удалить последний preset' : 'Удалить preset'}
                    type="button"
                  >
                    <TrashIcon size={11} />
                  </button>
                )}
              </>
            ) : null}
          </div>
          <div className="row gap-8">
            <button
              className="btn btn--xs"
              disabled={createMutation.isPending || updateMutation.isPending}
              onClick={() => setForm((current) => ({ ...DEFAULT_SAMPLER_VALUES, name: current.name }))}
              title="Вернуть параметры к значениям по умолчанию; название остаётся"
              type="button"
            >
              <RefreshIcon size={11} /> К умолчаниям
            </button>
            <button
              className="btn btn--xs"
              disabled={(!isCreating && !isDirty) || createMutation.isPending || updateMutation.isPending}
              onClick={() => {
                if (isCreating) {
                  setIsCreating(false);
                  setSelectedId(sampler.activePresetId);
                } else {
                  setForm(baseline);
                }
              }}
              type="button"
            >
              {isCreating ? 'Отменить создание' : 'Отменить'}
            </button>
            <button className="btn btn--primary btn--xs" disabled={!canSave} type="submit">
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Привязок к моделям: <span className="mono tnum">{sampler.modelBindingCount}</span>
      </div>
    </section>
  );
}
