export interface PromptTemplateCardProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
}

export function PromptTemplateCard({ disabled, onChange, value }: PromptTemplateCardProps) {
  const trimmedLength = value.trim().length;
  return (
    <section className="card" id="prompts" style={{ padding: 18, display: 'grid', gap: 14 }}>
      <div className="between">
        <h2 style={{ margin: 0, fontSize: 'var(--fz-xl)', fontWeight: 600 }}>System Prompt</h2>
        <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
          {trimmedLength > 0 ? `${trimmedLength} символов` : 'шаблон не задан'}
        </span>
      </div>
      <textarea
        className="textarea mono"
        disabled={disabled}
        maxLength={20_000}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Например: Reply as {{char}} and do not speak for {{user}}."
        rows={10}
        style={{ fontSize: 'var(--fz-xs)', lineHeight: 1.55, minHeight: 220 }}
        value={value}
      />
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        Шаблон применяется ко всем чатам, у которых не задан собственный system prompt.
      </div>
    </section>
  );
}
