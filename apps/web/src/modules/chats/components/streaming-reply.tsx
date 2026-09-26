import type { MessageFormatting } from '@immersion/contracts/settings';
import { useEffect, useState } from 'react';

import { Avatar } from '../../../shared/ui/avatar';
import { renderMessageContent } from '../view-models/message-content';
import { ReasoningBlock } from './reasoning-block';

export interface StreamingReplyProps {
  avatarUrl: string | null;
  formatting: MessageFormatting;
  reasoning: string;
  showReasoning: boolean;
  startedAt: string | null;
  text: string;
  who: string;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} с`;
  }

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function StreamingReply({
  avatarUrl,
  formatting,
  reasoning,
  showReasoning,
  startedAt,
  text,
  who,
}: StreamingReplyProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAtMs = startedAt ? new Date(startedAt).getTime() : Date.now();
    const tick = () => setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)));

    tick();
    const timer = setInterval(tick, 1000);

    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="bubble-row" style={{ alignItems: 'flex-start', display: 'flex', gap: 10 }}>
      <Avatar name={who} size={36} url={avatarUrl} />
      <div style={{ minWidth: 0 }}>
        <div className="muted row gap-6" style={{ alignItems: 'center', fontSize: 'var(--fz-xs)', marginBottom: 4 }}>
          <span className="dot" style={{ background: 'var(--accent)', height: 6, width: 6 }} />
          <span>{who} печатает…</span>
          <span className="mono tnum">{formatElapsed(elapsedSeconds)}</span>
        </div>
        {showReasoning && reasoning.length > 0 ? <ReasoningBlock defaultOpen text={reasoning} /> : null}
        {text.length > 0 ? <div className="bubble">{renderMessageContent(text, formatting)}</div> : null}
      </div>
    </div>
  );
}
