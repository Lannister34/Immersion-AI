import type { ChatMessageAttachmentDto } from '@immersion/contracts/chats';
import { type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent, useRef } from 'react';

import { createApiUrl } from '../../../shared/api/client';
import {
  BookIcon,
  PaperclipIcon,
  PlayIcon,
  SendIcon,
  SlidersIcon,
  SparkleIcon,
  StopIcon,
  XIcon,
} from '../../../shared/ui/icons';

export interface ComposerProps {
  attachments: ChatMessageAttachmentDto[];
  /** Подсказка о поддержке картинок моделью; null — прикреплять нельзя. */
  attachmentsHint: string;
  attachmentsError: string | null;
  blockReason?: string | undefined;
  canAttachImages: boolean;
  isUploadingAttachment: boolean;
  onAttachFiles: (files: readonly File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  canAnswer: boolean;
  canContinue: boolean;
  canSend: boolean;
  isStreaming: boolean;
  onAnswer: () => void;
  onCancel: () => void;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onContinue: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onOpenContext: () => void;
  onOpenSettings: () => void;
  onSubmit: (event?: FormEvent) => void;
  value: string;
}

export function Composer({
  attachments,
  attachmentsError,
  attachmentsHint,
  blockReason,
  canAttachImages,
  isUploadingAttachment,
  onAttachFiles,
  onRemoveAttachment,
  canAnswer,
  canContinue,
  canSend,
  isStreaming,
  onAnswer,
  onCancel,
  onChange,
  onContinue,
  onKeyDown,
  onOpenContext,
  onOpenSettings,
  onSubmit,
  value,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (picked.length > 0) {
      onAttachFiles(picked);
    }
  };

  // Ctrl+V с картинкой в буфере — самый быстрый путь: скриншот попадает
  // в сообщение без сохранения на диск.
  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!canAttachImages) {
      return;
    }

    const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));

    if (pasted.length > 0) {
      event.preventDefault();
      onAttachFiles(pasted);
    }
  };

  return (
    <form
      className="card"
      onSubmit={onSubmit}
      style={{ padding: '10px 12px', display: 'grid', gap: 8, background: 'var(--surface)' }}
    >
      {attachments.length > 0 ? (
        <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
          {attachments.map((attachment) => (
            <span className="composer-thumb" key={attachment.id}>
              <img alt="" src={createApiUrl(attachment.url)} />
              <button
                className="composer-thumb__remove"
                onClick={() => onRemoveAttachment(attachment.id)}
                title="Убрать изображение"
                type="button"
              >
                <XIcon size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        className="textarea"
        onChange={onChange}
        onKeyDown={onKeyDown}
        onPaste={handlePaste}
        placeholder={blockReason ?? 'Напишите сообщение…'}
        style={{ minHeight: 48, border: 0, background: 'transparent', padding: 0, resize: 'none' }}
        value={value}
      />
      <div className="between">
        <div className="row gap-4">
          <button className="btn btn--icon" onClick={onOpenContext} title="Контекст чата" type="button">
            <BookIcon size={14} />
          </button>
          <button className="btn btn--icon" onClick={onOpenSettings} title="Параметры модели" type="button">
            <SlidersIcon size={14} />
          </button>
          <button
            className="btn btn--icon"
            disabled={!canAttachImages || isUploadingAttachment}
            onClick={() => fileInputRef.current?.click()}
            title={attachmentsHint}
            type="button"
          >
            <PaperclipIcon size={14} />
          </button>
          <input
            accept="image/png,image/jpeg,image/webp"
            hidden
            multiple
            onChange={(event) => {
              handleFiles(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
            ref={fileInputRef}
            type="file"
          />
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
      {attachmentsError ? (
        <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>{attachmentsError}</div>
      ) : null}
    </form>
  );
}
