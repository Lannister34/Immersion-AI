import { useEffect, useRef, useState } from 'react';

import { ChevronDownIcon } from '../../../shared/ui/icons';
import type { ContextStats } from '../view-models/context-stats';

export interface ContextMeterProps {
  stats: ContextStats;
}

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

/** Счётчик контекста в шапке чата: сам бар — кнопка, подробности — во всплывашке. */
export function ContextMeter({ stats }: ContextMeterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const ratio = stats.contextWindow > 0 ? Math.min(1, stats.totalTokens / stats.contextWindow) : 0;
  const percent = Math.round(ratio * 100);
  const isApproximate = stats.tokenCountMethod === 'approximate';
  const rows: [string, string][] = [
    ['системный промпт', formatNumber(stats.systemTokens)],
    ['переписка', formatNumber(stats.transcriptTokens)],
    ['сообщений', formatNumber(stats.messageCount)],
  ];
  const tailRows: [string, string][] = [
    ['окно контекста', formatNumber(stats.contextWindow)],
    ['предустановка', stats.presetName ?? '—'],
    ['подсчёт', isApproximate ? 'приблизительный' : 'точный'],
  ];

  return (
    <div ref={rootRef}>
      <button
        className="tokenbtn"
        data-open={isOpen ? 'true' : 'false'}
        onClick={() => setIsOpen((current) => !current)}
        title="Подробности о контексте"
        type="button"
      >
        <span>
          <span className="between" style={{ fontSize: 'var(--fz-2xs)' }}>
            <span className="muted">Контекст</span>
            <span className="mono tnum muted">
              {isApproximate ? '≈ ' : ''}
              {formatNumber(stats.totalTokens)} / {formatNumber(stats.contextWindow)} · {percent}%
            </span>
          </span>
          <span className="tokenbar__track" style={{ display: 'block', marginTop: 4 }}>
            <span
              className={ratio >= 0.8 ? 'tokenbar__fill tokenbar__fill--warn' : 'tokenbar__fill'}
              style={{ display: 'block', width: `${percent}%` }}
            />
          </span>
        </span>
        <ChevronDownIcon className="chevron" size={12} />
      </button>
      {isOpen ? (
        <div className="chat-stats col gap-6">
          {rows.map(([label, value]) => (
            <div className="between" key={label} style={{ fontSize: 'var(--fz-xs)' }}>
              <span className="muted">{label}</span>
              <span className="mono tnum">{value}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--hairline)', margin: '2px 0' }} />
          {tailRows.map(([label, value]) => (
            <div className="between" key={label} style={{ fontSize: 'var(--fz-xs)' }}>
              <span className="muted">{label}</span>
              <span className="mono tnum truncate" style={{ marginLeft: 8 }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
