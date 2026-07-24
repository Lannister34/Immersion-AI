import { useState } from 'react';

import { ChevronRightIcon } from '../../../shared/ui/icons';
import type { AutoSavedGenerationSettings } from '../mutations/use-auto-saved-generation-settings';
import { MarkDot } from './mark-dot';

export interface FinalPromptSectionProps {
  /** Промпт, собранный backend: он же заготовка для ручной правки. */
  assembledPrompt: string | undefined;
  form: AutoSavedGenerationSettings;
}

export function FinalPromptSection({ assembledPrompt, form }: FinalPromptSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isManual = form.draft.systemPrompt.trim().length > 0;
  const value = isManual ? form.draft.systemPrompt : (assembledPrompt ?? '');

  return (
    <div className="col gap-8" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
      <button
        className="disclosure"
        data-open={isOpen ? 'true' : 'false'}
        data-overridden={isManual ? 'true' : 'false'}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <ChevronRightIcon className="chevron" size={13} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="row gap-6" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fz-sm)', fontWeight: 600 }}>Итоговый промпт</span>
            {isManual ? <MarkDot title="Переопределён вручную" /> : null}
          </span>
          <span style={{ color: 'var(--muted-dim)', display: 'block', fontSize: 'var(--fz-2xs)' }}>
            {isManual
              ? 'переопределён вручную — собирается только из этого текста'
              : 'собран автоматически — шаблон, персонаж, сценарий, лорбуки'}
          </span>
        </span>
      </button>
      {isOpen ? (
        <>
          <p className="muted" style={{ fontSize: 'var(--fz-2xs)', lineHeight: 1.5, margin: 0 }}>
            Это то, что уходит в модель. Если начать правку — промпт перестанет собираться и всё выше перестанет на него
            влиять.
          </p>
          {isManual ? (
            <div
              className="row gap-8"
              style={{
                alignItems: 'center',
                background: 'var(--warn-soft)',
                borderRadius: 8,
                color: 'var(--warn)',
                fontSize: 'var(--fz-2xs)',
                lineHeight: 1.5,
                padding: '8px 10px',
              }}
            >
              <span style={{ flex: 1 }}>
                Промпт переопределён вручную: персонаж, сценарий и лорбуки в него больше не подставляются.
              </span>
              <button
                className="btn btn--xs btn--ghost-bordered"
                onClick={() => form.setSystemPrompt('', { immediate: true })}
                style={{ flex: 'none' }}
                type="button"
              >
                Собрать заново
              </button>
            </div>
          ) : null}
          <textarea
            aria-label="Итоговый промпт"
            className="textarea mono"
            maxLength={20_000}
            onChange={(event) => {
              const { value: next } = event.currentTarget;
              form.setSystemPrompt(next);
            }}
            placeholder="Промпт пуст: в свободном чате без персонажа и шаблона системного сообщения нет. Начните печатать, чтобы задать свой."
            rows={14}
            style={{ fontSize: 'var(--fz-xs)', lineHeight: 1.6, minHeight: 240 }}
            value={value}
          />
        </>
      ) : null}
    </div>
  );
}
