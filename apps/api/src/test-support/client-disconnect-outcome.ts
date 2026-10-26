import type { CapturingLogger, LogLine } from './capturing-logger.js';

export const CLIENT_DISCONNECT_LOG_MESSAGE = 'Client disconnected before the response ended';

export function clientDisconnectOutcome(logs: CapturingLogger): Promise<LogLine> {
  return logs.firstLine((line) => line.level === 'error' || line.msg === CLIENT_DISCONNECT_LOG_MESSAGE);
}
