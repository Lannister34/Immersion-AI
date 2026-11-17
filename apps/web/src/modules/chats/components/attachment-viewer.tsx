import { useEffect, useRef } from 'react';

export interface AttachmentViewerProps {
  url: string;
  onClose: () => void;
}

export function AttachmentViewer({ onClose, url }: AttachmentViewerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div aria-label="Просмотр вложения" aria-modal="true" className="attachment-viewer" role="dialog">
      <button
        aria-label="Закрыть просмотр"
        className="attachment-viewer__backdrop"
        onClick={onClose}
        ref={closeButtonRef}
        type="button"
      />
      <img alt="Вложение сообщения" className="attachment-viewer__image" src={url} />
    </div>
  );
}
