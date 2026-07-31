import { apiDeleteNoContent } from '../../../shared/api/client';

export function deleteLorebook(lorebookId: string): Promise<void> {
  return apiDeleteNoContent(`/api/lorebooks/${encodeURIComponent(lorebookId)}`);
}
