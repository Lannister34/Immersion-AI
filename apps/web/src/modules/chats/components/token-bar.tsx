import type { CSSProperties } from 'react';

export interface TokenBarProps {
  fill: number;
  label: string;
  total: number;
}

export function TokenBar({ fill, label, total }: TokenBarProps) {
  const ratio = total > 0 ? Math.min(1, fill / total) : 0;
  const percent = Math.round(ratio * 100);
  const fillStyle: CSSProperties = {
    width: `${Math.max(0, Math.min(100, percent))}%`,
  };
  const isWarn = ratio >= 0.8;
  return (
    <div className="tokenbar" style={{ width: 200 }}>
      <div className="tokenbar__track">
        <div className={isWarn ? 'tokenbar__fill tokenbar__fill--warn' : 'tokenbar__fill'} style={fillStyle} />
      </div>
      <div className="tnum mono">{label}</div>
    </div>
  );
}
