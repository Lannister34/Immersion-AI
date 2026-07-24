import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import {
  createEmptySamplingDraft,
  parseSamplingDraft,
  type SamplingOverrideErrors,
  type SamplingOverrideKey,
  type SamplingOverridesDraft,
  samplingDraftsEqual,
  toSamplingDraft,
} from '../view-models/sampling-overrides';
import { useUpdateChatGenerationSettings } from './use-update-chat-generation-settings';

export const INHERIT_PRESET_VALUE = '';

/** Дискретные действия сохраняем сразу, ввод и перетаскивание — после паузы. */
const IMMEDIATE_DELAY_MS = 0;
const TYPING_DELAY_MS = 500;
const RETRY_WHILE_IN_FLIGHT_MS = 200;

export interface GenerationSettingsDraft {
  samplerPresetId: string;
  sampling: SamplingOverridesDraft;
  systemPrompt: string;
}

export interface AutoSavedGenerationSettings {
  clearSamplingOverrides: () => void;
  draft: GenerationSettingsDraft;
  errors: SamplingOverrideErrors;
  saveError: string | null;
  setSampling: (key: SamplingOverrideKey, value: string, options?: { immediate?: boolean }) => void;
  setSamplerPresetId: (presetId: string) => void;
  setSystemPrompt: (value: string) => void;
}

function toDraft(generationSettings: ChatGenerationSettingsDto): GenerationSettingsDraft {
  return {
    samplerPresetId: generationSettings.samplerPresetId ?? INHERIT_PRESET_VALUE,
    sampling: toSamplingDraft(generationSettings.sampling),
    systemPrompt: generationSettings.systemPrompt ?? '',
  };
}

function draftsEqual(left: GenerationSettingsDraft, right: GenerationSettingsDraft): boolean {
  return (
    left.samplerPresetId === right.samplerPresetId &&
    left.systemPrompt === right.systemPrompt &&
    samplingDraftsEqual(left.sampling, right.sampling)
  );
}

/**
 * Черновик настроек генерации чата с сохранением без кнопки: изменение уходит
 * на сервер само. Драфт один на всю панель — обе секции пишут в одну и ту же
 * настройку, и раздельные черновики затирали бы друг друга.
 */
export function useAutoSavedGenerationSettings(
  chatId: string,
  generationSettings: ChatGenerationSettingsDto,
): AutoSavedGenerationSettings {
  const baseline = useMemo(() => toDraft(generationSettings), [generationSettings]);
  const [draft, setDraft] = useState<GenerationSettingsDraft>(baseline);
  const [syncedBaseline, setSyncedBaseline] = useState(baseline);
  const [errors, setErrors] = useState<SamplingOverrideErrors>({});
  const [pendingSave, setPendingSave] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const mutation = useUpdateChatGenerationSettings(chatId);

  // Серверные значения принимаем только когда своих несохранённых правок нет,
  // иначе фоновая ревалидация откатывала бы то, что пользователь только что ввёл.
  if (!draftsEqual(syncedBaseline, baseline) && !pendingSave && !inFlightRef.current) {
    setSyncedBaseline(baseline);
    setDraft(baseline);
    setErrors({});
  }

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const commit = (next: GenerationSettingsDraft) => {
    // Пока предыдущее сохранение в полёте, ждём: иначе ответы могут разойтись
    // по порядку и в кэш ляжет устаревший снимок.
    if (inFlightRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        commit(next);
      }, RETRY_WHILE_IN_FLIGHT_MS);
      return;
    }

    const parsedSampling = parseSamplingDraft(next.sampling);

    if (!parsedSampling.overrides) {
      setErrors(parsedSampling.errors);
      setPendingSave(false);
      return;
    }

    setErrors({});
    inFlightRef.current = true;
    mutation.mutate(
      {
        samplerPresetId: next.samplerPresetId === INHERIT_PRESET_VALUE ? null : next.samplerPresetId,
        sampling: parsedSampling.overrides,
        systemPrompt: next.systemPrompt.trim().length > 0 ? next.systemPrompt : null,
      },
      {
        onSettled: () => {
          inFlightRef.current = false;
          if (!timerRef.current) {
            setPendingSave(false);
          }
        },
      },
    );
  };

  const schedule = (next: GenerationSettingsDraft, delay: number) => {
    setDraft(next);
    setPendingSave(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commit(next);
    }, delay);
  };

  return {
    clearSamplingOverrides: () => {
      schedule({ ...draft, sampling: createEmptySamplingDraft() }, IMMEDIATE_DELAY_MS);
    },
    draft,
    errors,
    saveError: mutation.error ? getApiErrorMessage(mutation.error, 'Не удалось сохранить настройки чата.') : null,
    setSampling: (key, value, options) => {
      schedule(
        { ...draft, sampling: { ...draft.sampling, [key]: value } },
        options?.immediate ? IMMEDIATE_DELAY_MS : TYPING_DELAY_MS,
      );
    },
    setSamplerPresetId: (presetId) => {
      schedule({ ...draft, samplerPresetId: presetId }, IMMEDIATE_DELAY_MS);
    },
    setSystemPrompt: (value) => {
      schedule({ ...draft, systemPrompt: value }, TYPING_DELAY_MS);
    },
  };
}
