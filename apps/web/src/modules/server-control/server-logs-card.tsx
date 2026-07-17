import type { RuntimeServerStatus } from '@immersion/contracts/runtime';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { ChevronDownIcon, ChevronRightIcon, CopyIcon } from '../../shared/ui/icons';
import { runtimeLogsQueryOptions } from './queries/runtime-logs-query';

const LOGS_POLL_INTERVAL_MS = 2000;

function formatLineCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} строк`;
  if (mod10 === 1) return `${count} строка`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} строки`;
  return `${count} строк`;
}

type CopyFeedback = 'idle' | 'copied' | 'failed';

interface ServerLogsCardProps {
  status: RuntimeServerStatus;
}

export function ServerLogsCard({ status }: ServerLogsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [lastStatus, setLastStatus] = useState<RuntimeServerStatus>(status);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>('idle');
  const scrollRef = useRef<HTMLPreElement>(null);

  // Автораскрытие при переходе в ошибку: причина неудачного старта должна быть видна сразу.
  if (status !== lastStatus) {
    setLastStatus(status);
    if (status === 'error') {
      setExpanded(true);
    }
  }

  const logsQuery = useQuery({
    ...runtimeLogsQueryOptions(),
    enabled: expanded,
    refetchInterval: expanded ? LOGS_POLL_INTERVAL_MS : false,
  });

  const lines = logsQuery.data?.lines ?? [];
  const lineCount = lines.length;

  useEffect(() => {
    if (lines.length === 0) return;
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    if (copyFeedback === 'idle') return;
    const timer = setTimeout(() => setCopyFeedback('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyFeedback]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopyFeedback('copied');
    } catch {
      setCopyFeedback('failed');
    }
  };

  let copyFeedbackLabel: string | null = null;
  if (copyFeedback === 'copied') {
    copyFeedbackLabel = 'Скопировано';
  } else if (copyFeedback === 'failed') {
    copyFeedbackLabel = 'Не удалось скопировать';
  }

  let logsBody: string;
  if (lineCount > 0) {
    logsBody = lines.join('\n');
  } else if (logsQuery.isPending) {
    logsBody = 'Загрузка логов…';
  } else if (logsQuery.isError) {
    logsBody = 'Не удалось загрузить логи сервера.';
  } else {
    logsBody = 'Логи пусты. Запустите модель, чтобы увидеть вывод llama-server.';
  }

  return (
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="between" style={{ padding: '12px 14px' }}>
        <button
          className="row gap-8"
          onClick={() => setExpanded((current) => !current)}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'inherit',
            font: 'inherit',
          }}
          type="button"
        >
          {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          <h2 style={{ margin: 0, fontSize: 'var(--fz-md)', fontWeight: 600 }}>Логи сервера</h2>
          {expanded ? (
            <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
              {formatLineCount(lineCount)}
            </span>
          ) : null}
        </button>
        {expanded ? (
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            {copyFeedbackLabel ? (
              <span className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
                {copyFeedbackLabel}
              </span>
            ) : null}
            <button
              className="btn btn--xs btn--ghost-bordered"
              disabled={lineCount === 0}
              onClick={() => void handleCopy()}
              type="button"
            >
              <CopyIcon size={12} /> Скопировать
            </button>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <pre
          className="mono"
          ref={scrollRef}
          style={{
            margin: 0,
            padding: '12px 14px',
            borderTop: '1px solid var(--hairline)',
            background: '#0b0d12',
            color: '#c9d1d9',
            fontSize: 'var(--fz-xs)',
            lineHeight: 1.5,
            maxHeight: 320,
            overflowY: 'auto',
            overflowX: 'auto',
            whiteSpace: 'pre',
          }}
        >
          {logsBody}
        </pre>
      ) : null}
    </section>
  );
}
