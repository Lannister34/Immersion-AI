import { MAX_REPLY_TOKEN_LIMIT, type ReplyTokenLimit, UNLIMITED_REPLY_TOKENS } from '@immersion/contracts/common';
import { useState } from 'react';

import { describeReplyBudget } from '../view-models/reply-budget-hint';

export interface ReplyLimitFieldProps {
  contextLength: number;
  id: string;
  onChange: (value: ReplyTokenLimit) => void;
  restoredLimit: number;
  value: ReplyTokenLimit;
}

export function ReplyLimitField({ contextLength, id, onChange, restoredLimit, value }: ReplyLimitFieldProps) {
  const isUnlimited = value === UNLIMITED_REPLY_TOKENS;
  const [invalidText, setInvalidText] = useState<string | null>(null);
  const budgetHint = describeReplyBudget(contextLength, value);
  const hint =
    invalidText === null
      ? budgetHint
      : { text: `Нужно целое число от 1 до ${MAX_REPLY_TOKEN_LIMIT.toLocaleString('ru-RU')}`, tone: 'warn' as const };

  return (
    <div className="field">
      <div className="row gap-12" style={{ alignItems: 'center' }}>
        <label
          className="muted"
          htmlFor={id}
          style={{ fontSize: 'var(--fz-2xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          max_length
        </label>
        <label className="row gap-6" style={{ alignItems: 'center', fontSize: 'var(--fz-xs)' }}>
          <input
            checked={isUnlimited}
            onChange={(event) => {
              setInvalidText(null);
              onChange(event.currentTarget.checked ? UNLIMITED_REPLY_TOKENS : restoredLimit);
            }}
            type="checkbox"
          />
          Без лимита
        </label>
      </div>
      <input
        className="input mono"
        disabled={isUnlimited}
        id={id}
        max={MAX_REPLY_TOKEN_LIMIT}
        min={1}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          const parsed = Number(raw);
          if (raw.trim().length === 0 || !Number.isInteger(parsed) || parsed < 1 || parsed > MAX_REPLY_TOKEN_LIMIT) {
            setInvalidText(raw);
            return;
          }
          setInvalidText(null);
          onChange(parsed);
        }}
        placeholder={isUnlimited ? 'без лимита' : undefined}
        step={1}
        style={{ maxWidth: 220 }}
        type="number"
        value={isUnlimited ? '' : (invalidText ?? String(value))}
      />
      <span style={{ color: hint.tone === 'warn' ? 'var(--warn)' : 'var(--muted)', fontSize: 'var(--fz-2xs)' }}>
        {hint.text}
      </span>
    </div>
  );
}
