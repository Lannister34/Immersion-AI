import { type RuntimeLogsResponse, RuntimeLogsResponseSchema } from '@immersion/contracts/runtime';

import { getLlmProcessManager } from '../infrastructure/llm-process-manager.js';

export function getRuntimeLogs(): RuntimeLogsResponse {
  const manager = getLlmProcessManager();

  return RuntimeLogsResponseSchema.parse({
    lines: manager.getLogs(),
    status: manager.getState().status,
  });
}
