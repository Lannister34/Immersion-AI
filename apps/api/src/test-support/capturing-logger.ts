import pino from 'pino';

import type { ApiLogger } from '../platform/logging/api-logger.js';

export interface CapturingLogger {
  readonly logger: ApiLogger;
  readonly lines: readonly Readonly<Record<string, unknown>>[];
}

function parseLogLine(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object per log line, got: ${text}`);
  }

  return Object.fromEntries(Object.entries(parsed));
}

export function createCapturingLogger(): CapturingLogger {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { formatters: { level: (label) => ({ level: label }) }, level: 'trace' },
    {
      write(text: string) {
        lines.push(parseLogLine(text));
      },
    },
  );

  return { lines, logger };
}
