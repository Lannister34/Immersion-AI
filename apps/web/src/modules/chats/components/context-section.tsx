import type { ContextStats } from '../view-models/context-stats';

export interface ContextSectionContentProps {
  stats?: ContextStats | undefined;
}

export function ContextSectionContent({ stats }: ContextSectionContentProps) {
  if (!stats) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Превью контекста пока не загружено.
      </div>
    );
  }
  const lines: [string, string][] = [
    ['всего', stats.totalTokens.toLocaleString('ru-RU')],
    ['контекст-окно', stats.contextWindow.toLocaleString('ru-RU')],
    ['сообщений', String(stats.messageCount)],
    ['system', stats.systemTokens.toLocaleString('ru-RU')],
    ['transcript', stats.transcriptTokens.toLocaleString('ru-RU')],
    ['подсчёт', stats.tokenCountMethod === 'approximate' ? 'приблизительный' : 'точный'],
  ];
  if (stats.presetName) lines.push(['preset', stats.presetName]);
  if (stats.modelName) lines.push(['model', stats.modelName]);

  return (
    <div className="col gap-8">
      <div className="card" style={{ padding: 10, background: 'var(--surface)', display: 'grid', gap: 6 }}>
        {lines.map(([k, v]) => (
          <div className="between" key={k} style={{ fontSize: 'var(--fz-xs)' }}>
            <span className="muted">{k}</span>
            <span className="mono tnum">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
