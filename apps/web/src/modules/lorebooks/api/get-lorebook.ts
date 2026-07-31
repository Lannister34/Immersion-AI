import { LorebookDetailResponseSchema } from '@immersion/contracts/lorebooks';

import { apiGet } from '../../../shared/api/client';

export function getLorebook(lorebookId: string) {
  return apiGet(`/api/lorebooks/${encodeURIComponent(lorebookId)}`, LorebookDetailResponseSchema);
}
