import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';

import { BookIcon, CpuIcon, PaperclipIcon, SendIcon, SlidersIcon, StopIcon } from '../../../shared/ui/icons';

export interface ComposerProps {
  blockReason?: string | undefined;
  canSend: boolean;
  isStreaming: boolean;
  onCancel: () => void;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event?: FormEvent) => void;
  value: string;
}

export function Composer({
  blockReason,
  canSend,
  isStreaming,
  onCancel,
  onChange,
  onKeyDown,
  onSubmit,
  value,
}: ComposerProps) {
  return (
    <form
      className="card"
      onSubmit={onSubmit}
      style={{ padding: '10px 12px', display: 'grid', gap: 8, background: 'var(--surface)' }}
    >
      <textarea
        className="textarea"
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={blockReason ?? 'Напишите сообщение…'}
        style={{ minHeight: 48, border: 0, background: 'transparent', padding: 0, resize: 'none' }}
        value={value}
      />
      <div className="between">
        <div className="row gap-4">
          <button className="btn btn--icon" title="Прикрепить" type="button">
            <PaperclipIcon size={14} />
          </button>
          <button className="btn btn--icon" title="Лорбук" type="button">
            <BookIcon size={14} />
          </button>
          <button className="btn btn--icon" title="Модель" type="button">
            <CpuIcon size={14} />
          </button>
          <button className="btn btn--icon" title="Настройки" type="button">
            <SlidersIcon size={14} />
          </button>
          <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }} title="Длина сообщения в символах">
            {value.length.toLocaleString('ru-RU')} симв.
          </span>
        </div>
        <div className="row gap-8">
          <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
            <span className="kbd">Enter</span> отправить
          </span>
          {isStreaming ? (
            <button className="btn btn--ghost-bordered" onClick={onCancel} type="button">
              <StopIcon size={14} /> Остановить
            </button>
          ) : (
            <button className="btn btn--primary" disabled={!canSend} type="submit">
              <SendIcon size={14} /> Отправить
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
