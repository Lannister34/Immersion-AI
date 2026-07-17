import {
  type GenerateScenarioFirstMessageCommand,
  GenerateScenarioFirstMessageCommandSchema,
  type GenerateScenarioFirstMessageResponse,
  GenerateScenarioFirstMessageResponseSchema,
} from '@immersion/contracts/generation';

import { apiPost } from '../../../shared/api/client';

export function generateScenarioFirstMessage(
  command: GenerateScenarioFirstMessageCommand,
): Promise<GenerateScenarioFirstMessageResponse> {
  return apiPost(
    '/api/generation/scenario-first-message',
    command,
    GenerateScenarioFirstMessageCommandSchema,
    GenerateScenarioFirstMessageResponseSchema,
  );
}
