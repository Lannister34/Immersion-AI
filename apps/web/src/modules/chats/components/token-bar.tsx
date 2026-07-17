import type { CSSProperties } from 'react';

export interface TokenBarProps {
  approximate: boolean;
  fill: number;
  label: string;
  total: number;
}

export function TokenBar({ approximate, fill, label, total }: TokenBarProps) {
  const ratio = total > 0 ? Math.min(1, fill / total) : 0;
  const percent = Math.round(ratio * 100);
  const fillStyle: CSSProperties = {
    width: `${Math.max(0, Math.min(100, percent))}%`,
  };
  const isWarn = ratio >= 0.8;
  const tooltip = approximate
    ? 'Приблизительный подсчёт токенов (эвристика по длине текста)'
    : 'Точный подсчёт токенов (токенизатор запущенной модели)';
  return (
    <div className="tokenbar" style={{ width: 200 }} title={tooltip}>
      <div className="tokenbar__track">
        <div className={isWarn ? 'tokenbar__fill tokenbar__fill--warn' : 'tokenbar__fill'} style={fillStyle} />
      </div>
      <div className="tnum mono">{approximate ? `≈ ${label}` : label}</div>
    </div>
  );
}
