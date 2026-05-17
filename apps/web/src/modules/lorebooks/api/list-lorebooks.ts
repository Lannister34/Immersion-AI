import { LorebookListResponseSchema } from '@immersion/contracts/lorebooks';

import { apiGet } from '../../../shared/api/client';

export function listLorebooks() {
  return apiGet('/api/lorebooks', LorebookListResponseSchema);
}
