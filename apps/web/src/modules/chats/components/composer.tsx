import type { ChatMessageAttachmentDto } from '@immersion/contracts/chats';
import { type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent, useRef, useState } from 'react';

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
import { formatContextEstimate } from '../view-models/context-estimate';
import type { ContextStats } from '../view-models/context-stats';
import { planImageDrop } from '../view-models/image-drop';
import { isImageFile } from '../view-models/is-image-file';

export interface ComposerProps {
  attachments: readonly ChatMessageAttachmentDto[];
  attachmentsHint: string;
  attachmentsError: string | null;
  attachmentsNotice: string | null;
  attachmentsUnavailableReason: string;
  blockReason?: string | undefined;
  canAttachImages: boolean;
  isUploadingAttachment: boolean;
  onAttachFiles: (files: readonly File[]) => void;
  onAttachmentsNotice: (notice: string | null) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  canAnswer: boolean;
  canContinue: boolean;
  canSend: boolean;
  draftStats: ContextStats | undefined;
  isStreaming: boolean;
  onAnswer: () => void;
  onCancel: () => void;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onContinue: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onOpenContext: () => void;
  onOpenSettings: () => void;
  onSubmit: (event?: FormEvent) => void;
  sendRefusal: string | null;
  value: string;
}

interface ComposerThumbProps {
  attachment: ChatMessageAttachmentDto;
  onRemove: () => void;
}

function ComposerThumb({ attachment, onRemove }: ComposerThumbProps) {
  const [isMissing, setIsMissing] = useState(false);

  return (
    <span className="composer-thumb" data-missing={isMissing ? 'true' : 'false'}>
      {isMissing ? (
        <span
          className="composer-thumb__missing"
          title="Изображение не открывается — возможно, файл удалён. Уберите его и приложите заново."
        >
          нет файла
        </span>
      ) : (
        <img alt="" onError={() => setIsMissing(true)} src={createApiUrl(attachment.url)} />
      )}
      <button className="composer-thumb__remove" onClick={onRemove} title="Убрать изображение" type="button">
        <XIcon size={10} />
      </button>
    </span>
  );
}

export function Composer({
  attachments,
  attachmentsError,
  attachmentsHint,
  attachmentsNotice,
  attachmentsUnavailableReason,
  blockReason,
  canAttachImages,
  isUploadingAttachment,
  onAttachFiles,
  onAttachmentsNotice,
  onRemoveAttachment,
  canAnswer,
  canContinue,
  canSend,
  draftStats,
  isStreaming,
  onAnswer,
  onCancel,
  onChange,
  onContinue,
  onKeyDown,
  onOpenContext,
  onOpenSettings,
  onSubmit,
  sendRefusal,
  value,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (picked.length > 0) {
      onAttachFiles(picked);
    }
  };

  const attachPastedImages = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);

    if (!files.some(isImageFile)) {
      return;
    }

    const plan = planImageDrop({ canAttachImages, files, unavailableReason: attachmentsUnavailableReason });
    if (plan.images.length > 0 || !event.clipboardData.types.includes('text/plain')) {
      event.preventDefault();
    }
    if (plan.images.length > 0) {
      onAttachFiles(plan.images);
    }
    onAttachmentsNotice(plan.notice);
  };

  return (
    <form className="card composer" onSubmit={onSubmit}>
      {attachments.length > 0 ? (
        <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
          {attachments.map((attachment) => (
            <ComposerThumb
              attachment={attachment}
              key={attachment.id}
              onRemove={() => onRemoveAttachment(attachment.id)}
            />
          ))}
        </div>
      ) : null}
      <textarea
        autoComplete="off"
        className="textarea composer__input"
        onChange={onChange}
        onKeyDown={onKeyDown}
        onPaste={attachPastedImages}
        placeholder={blockReason ?? 'Напишите сообщение…'}
        value={value}
      />
      <div className="between composer__footer">
        <div className="row gap-4 composer__tools">
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
          <span className="muted mono composer__counter composer__counter--chars" title="Длина сообщения в символах">
            {value.length.toLocaleString('ru-RU')} симв.
          </span>
          {draftStats ? (
            <span
              className="muted mono composer__counter"
              title={
                draftStats.tokenCountMethod === 'approximate'
                  ? 'Приблизительная оценка контекста, если отправить черновик'
                  : 'Точный подсчёт контекста, если отправить черновик'
              }
            >
              {formatContextEstimate(draftStats)} ток. с черновиком
            </span>
          ) : null}
        </div>
        <div className="row gap-8 composer__actions">
          <span className="muted composer__hint">
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
                  <PlayIcon size={14} /> <span className="btn__label">Продолжить</span>
                </button>
              ) : null}
              {canAnswer ? (
                <button
                  className="btn"
                  onClick={onAnswer}
                  title="Сгенерировать ответ на последнее сообщение"
                  type="button"
                >
                  <SparkleIcon size={14} /> <span className="btn__label">Сгенерировать ответ</span>
                </button>
              ) : null}
              <button className="btn btn--primary" disabled={!canSend} type="submit">
                <SendIcon size={14} /> <span className="btn__label">Отправить</span>
              </button>
            </>
          )}
        </div>
      </div>
      {sendRefusal ? (
        <div role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>
          {sendRefusal}
        </div>
      ) : null}
      {attachmentsNotice ? (
        <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
          {attachmentsNotice}
        </div>
      ) : null}
      {attachmentsError ? (
        <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>{attachmentsError}</div>
      ) : null}
    </form>
  );
}
