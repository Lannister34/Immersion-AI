import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';

import { BookIcon, PlayIcon, SendIcon, SlidersIcon, SparkleIcon, StopIcon } from '../../../shared/ui/icons';

export interface ComposerProps {
  blockReason?: string | undefined;
  canAnswer: boolean;
  canContinue: boolean;
  canSend: boolean;
  isStreaming: boolean;
  onAnswer: () => void;
  onCancel: () => void;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onContinue: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onOpenLorebooks: () => void;
  onOpenSettings: () => void;
  onSubmit: (event?: FormEvent) => void;
  value: string;
}

export function Composer({
  blockReason,
  canAnswer,
  canContinue,
  canSend,
  isStreaming,
  onAnswer,
  onCancel,
  onChange,
  onContinue,
  onKeyDown,
  onOpenLorebooks,
  onOpenSettings,
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
          <button className="btn btn--icon" onClick={onOpenLorebooks} title="Лорбуки чата" type="button">
            <BookIcon size={14} />
          </button>
          <button className="btn btn--icon" onClick={onOpenSettings} title="Настройки генерации" type="button">
            <SlidersIcon size={14} />
          </button>
          <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }} title="Длина сообщения в символах">
            {value.length.toLocaleString('ru-RU')} симв.
          </span>
        </div>
        <div className="row gap-8">
          <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
            <span className="kbd">Enter</span> отправить · <span className="kbd">Shift+Enter</span> — перенос строки
          </span>
          {isStreaming ? (
            <button className="btn btn--ghost-bordered" onClick={onCancel} type="button">
              <StopIcon size={14} /> Остановить
            </button>
          ) : (
            <>
              {canContinue ? (
                <button className="btn" onClick={onContinue} title="Продолжить последний ответ персонажа" type="button">
                  <PlayIcon size={14} /> Продолжить
                </button>
              ) : null}
              {canAnswer ? (
                <button
                  className="btn"
                  onClick={onAnswer}
                  title="Сгенерировать ответ на последнее сообщение"
                  type="button"
                >
                  <SparkleIcon size={14} /> Сгенерировать ответ
                </button>
              ) : null}
              <button className="btn btn--primary" disabled={!canSend} type="submit">
                <SendIcon size={14} /> Отправить
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
