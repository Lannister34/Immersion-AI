import { RuntimeLogsResponseSchema } from '@immersion/contracts/runtime';

import { apiGet } from '../../../shared/api/client';

export function getRuntimeLogs() {
  return apiGet('/api/runtime/logs', RuntimeLogsResponseSchema);
}
