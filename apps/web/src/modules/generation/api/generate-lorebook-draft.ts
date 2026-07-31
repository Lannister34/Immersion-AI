import {
  GenerateLorebookDraftCommandSchema,
  type GenerateLorebookDraftResponse,
  GenerateLorebookDraftResponseSchema,
} from '@immersion/contracts/generation';

import { apiPost } from '../../../shared/api/client';

// Совпадает с серверным значением по умолчанию в GenerateLorebookDraftCommandSchema.
const DEFAULT_LOREBOOK_DRAFT_ENTRY_COUNT = 8;

export function generateLorebookDraft(concept: string): Promise<GenerateLorebookDraftResponse> {
  return apiPost(
    '/api/generation/lorebook',
    { concept, entryCount: DEFAULT_LOREBOOK_DRAFT_ENTRY_COUNT },
    GenerateLorebookDraftCommandSchema,
    GenerateLorebookDraftResponseSchema,
  );
}
