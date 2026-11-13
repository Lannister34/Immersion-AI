import type { EditorDraftNotice } from '../drafts/use-editor-draft';

interface DraftRestoredNoticeProps {
  busy: boolean;
  notice: EditorDraftNotice | null;
  onDiscard: () => void;
  onDismiss: () => void;
}

export function DraftRestoredNotice({ busy, notice, onDiscard, onDismiss }: DraftRestoredNoticeProps) {
  if (!notice) return null;

  return (
    <div className={notice.conflict ? 'card alert alert--warn' : 'card alert alert--info'} role="status">
      <div className="between gap-8">
        <span>
          {notice.conflict
            ? 'Восстановлен несохранённый черновик, но сохранённая версия с тех пор изменилась. Сохранение черновика перезапишет её.'
            : 'Восстановлен несохранённый черновик.'}
        </span>
        <div className="row gap-8">
          <button className="btn btn--xs" disabled={busy} onClick={onDiscard} type="button">
            Отбросить черновик
          </button>
          {notice.conflict ? null : (
            <button className="btn btn--icon btn--xs" onClick={onDismiss} title="Скрыть уведомление" type="button">
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
