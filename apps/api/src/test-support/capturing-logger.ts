import pino from 'pino';

import type { ApiLogger } from '../platform/logging/api-logger.js';
import { createDeferred } from './deferred.js';

export type LogLine = Readonly<Record<string, unknown>>;

export type LogLinePredicate = (line: LogLine) => boolean;

export interface CapturingLogger {
  readonly logger: ApiLogger;
  readonly lines: readonly LogLine[];
  firstLine(matches: LogLinePredicate): Promise<LogLine>;
}

interface LineWaiter {
  readonly matches: LogLinePredicate;
  resolve(line: LogLine): void;
}

function parseLogLine(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected a JSON object per log line, got: ${text}`);
  }

  return Object.fromEntries(Object.entries(parsed));
}

export function createCapturingLogger(): CapturingLogger {
  const lines: LogLine[] = [];
  const waiters: LineWaiter[] = [];
  const logger = pino(
    { formatters: { level: (label) => ({ level: label }) }, level: 'trace' },
    {
      write(text: string) {
        const line = parseLogLine(text);
        lines.push(line);

        for (const waiter of waiters.filter((candidate) => candidate.matches(line))) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve(line);
        }
      },
    },
  );

  return {
    lines,
    logger,
    firstLine(matches) {
      const written = lines.find(matches);

      if (written !== undefined) {
        return Promise.resolve(written);
      }

      const next = createDeferred<LogLine>();
      waiters.push({ matches, resolve: next.resolve });

      return next.promise;
    },
  };
}
