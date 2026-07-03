import {
  type GenerateScenarioDraftCommand,
  GenerateScenarioDraftCommandSchema,
  type GenerateScenarioDraftResponse,
  GenerateScenarioDraftResponseSchema,
} from '@immersion/contracts/generation';

import { apiPost } from '../../../shared/api/client';

export function generateScenarioDraft(command: GenerateScenarioDraftCommand): Promise<GenerateScenarioDraftResponse> {
  return apiPost(
    '/api/generation/scenario',
    command,
    GenerateScenarioDraftCommandSchema,
    GenerateScenarioDraftResponseSchema,
  );
}
