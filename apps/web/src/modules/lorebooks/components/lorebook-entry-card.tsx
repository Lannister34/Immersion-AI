import { Field } from '../../../shared/ui/field';
import { TrashIcon } from '../../../shared/ui/icons';
import { TemplateTextarea } from '../../../shared/ui/template-textarea';
import type { EditorEntry } from '../forms/editor-entry';

interface LorebookEntryCardProps {
  busy: boolean;
  entry: EditorEntry;
  index: number;
  onChange: (patch: Partial<EditorEntry>) => void;
  onRemove: () => void;
}

export function LorebookEntryCard({ busy, entry, index, onChange, onRemove }: LorebookEntryCardProps) {
  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
      <div className="row gap-8" style={{ alignItems: 'center' }}>
        <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
          #{index + 1}
        </span>
        <label className="row gap-4" style={{ alignItems: 'center', fontSize: 'var(--fz-xs)' }}>
          <input
            checked={entry.enabled}
            disabled={busy}
            onChange={(event) => onChange({ enabled: event.currentTarget.checked })}
            type="checkbox"
          />
          включена
        </label>
        <label className="row gap-4" style={{ alignItems: 'center', fontSize: 'var(--fz-xs)' }}>
          приоритет
          <input
            className="input"
            disabled={busy}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              onChange({ priority: Number.isFinite(next) ? next : 0 });
            }}
            style={{ width: 80 }}
            type="number"
            value={entry.priority}
          />
        </label>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn--xs btn--icon"
          disabled={busy}
          onClick={onRemove}
          title="Удалить запись"
          type="button"
        >
          <TrashIcon size={12} />
        </button>
      </div>
      <Field id={`lorebook-entry-keys-${index}`} label="Ключи" hint="Через запятую. Регистр не важен.">
        <input
          className="input"
          disabled={busy}
          id={`lorebook-entry-keys-${index}`}
          onChange={(event) => onChange({ keysText: event.currentTarget.value })}
          placeholder="например: Меандр, студия, обжиг"
          value={entry.keysText}
        />
      </Field>
      <Field id={`lorebook-entry-content-${index}`} label="Контекст">
        <TemplateTextarea
          disabled={busy}
          id={`lorebook-entry-content-${index}`}
          maxLength={20_000}
          onChange={(next) => onChange({ content: next })}
          rows={4}
          value={entry.content}
        />
      </Field>
    </div>
  );
}
