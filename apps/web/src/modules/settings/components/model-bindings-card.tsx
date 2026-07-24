import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import { type FormEvent, useEffect, useState } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { TrashIcon, XIcon } from '../../../shared/ui/icons';
import { useDeleteModelBinding, useUpsertModelBinding } from '../mutations/use-model-binding-mutations';

export interface ModelBindingsCardProps {
  data: SettingsOverviewResponse;
}

export function ModelBindingsCard({ data }: ModelBindingsCardProps) {
  const { sampler } = data;
  const [newModelName, setNewModelName] = useState('');
  const [newPresetId, setNewPresetId] = useState<string>(sampler.activePresetId);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!sampler.presets.some((preset) => preset.id === newPresetId)) {
      setNewPresetId(sampler.activePresetId);
    }
  }, [newPresetId, sampler.activePresetId, sampler.presets]);

  const upsertMutation = useUpsertModelBinding({
    onSuccess: () => {
      setNewModelName('');
    },
  });
  const deleteMutation = useDeleteModelBinding({
    onSuccess: () => {
      setConfirmDelete(null);
    },
  });

  const mutationError = upsertMutation.error ?? deleteMutation.error;
  const mutationErrorMessage = mutationError
    ? getApiErrorMessage(mutationError, 'Не удалось обновить привязку.')
    : null;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newModelName.trim();
    if (trimmed.length === 0 || upsertMutation.isPending) return;
    upsertMutation.mutate({ modelName: trimmed, presetId: newPresetId });
  };

  return (
    <section className="card" id="models" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>Model Bindings</h2>
        <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          по умолчанию выбирается активный preset; здесь можно привязать конкретные модели
        </span>
      </div>
      {sampler.modelBindings.length === 0 ? (
        <div className="muted" style={{ fontSize: 'var(--fz-sm)' }}>
          Привязок пока нет. Добавьте имя файла модели и preset ниже.
        </div>
      ) : (
        <div className="col gap-6">
          {sampler.modelBindings.map((binding) => {
            const isConfirming = confirmDelete === binding.modelName;
            return (
              <div
                className="row gap-8"
                key={binding.modelName}
                style={{
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <span className="mono truncate" style={{ flex: 1, fontSize: 'var(--fz-sm)' }} title={binding.modelName}>
                  {binding.modelName}
                </span>
                <select
                  className="input"
                  disabled={upsertMutation.isPending}
                  onChange={(event) =>
                    upsertMutation.mutate({ modelName: binding.modelName, presetId: event.currentTarget.value })
                  }
                  // .input тянется на 100%, поэтому в строке фиксируем ширину:
                  // иначе select выдавливает имя модели из строки.
                  style={{ flex: '0 0 220px', width: 220 }}
                  value={binding.presetId}
                >
                  {sampler.presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                {isConfirming ? (
                  <>
                    <button
                      className="btn btn--danger btn--xs"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(binding.modelName)}
                      type="button"
                    >
                      {deleteMutation.isPending ? '…' : 'Удалить'}
                    </button>
                    <button
                      className="btn btn--icon btn--xs"
                      disabled={deleteMutation.isPending}
                      onClick={() => setConfirmDelete(null)}
                      type="button"
                    >
                      <XIcon size={11} />
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn--icon btn--xs"
                    onClick={() => setConfirmDelete(binding.modelName)}
                    title="Удалить привязку"
                    type="button"
                  >
                    <TrashIcon size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <form className="row gap-8" onSubmit={onSubmit} style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="binding-model-name">Имя файла модели</label>
          <input
            className="input mono"
            id="binding-model-name"
            onChange={(event) => setNewModelName(event.currentTarget.value)}
            placeholder="Например: Qwen3.5-35B-A3B-heretic-Q5_K_M.gguf"
            value={newModelName}
          />
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label htmlFor="binding-preset-id">Preset</label>
          <select
            className="input"
            id="binding-preset-id"
            onChange={(event) => setNewPresetId(event.currentTarget.value)}
            value={newPresetId}
          >
            {sampler.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn btn--primary btn--xs"
          disabled={newModelName.trim().length === 0 || upsertMutation.isPending}
          type="submit"
        >
          {upsertMutation.isPending ? '…' : 'Привязать'}
        </button>
      </form>
      {mutationErrorMessage ? (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: 10 }}>
          {mutationErrorMessage}
        </div>
      ) : null}
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Связь модели с preset переопределяет активный preset, когда runtime сообщает имя загруженной модели.
      </div>
    </section>
  );
}
